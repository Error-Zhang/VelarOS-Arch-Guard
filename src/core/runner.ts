import { resolve } from 'node:path'

import type { ResolvedConfig } from '../config/types'
import type { Reporter } from '../reporters/types'

import { applyScheduledFixes, collectFixableViolations, resolveFixEnabled } from './applyFixes'
import { type BaselineScan, loadBaselineFile, writeBaselineEntriesFile } from './baseline'
import type { ArchGuardSharedContext } from './context'
import { createSharedContext } from './context'
import type { Check, CheckRunContext } from './defineCheck'
import { buildCheckFilter, type CheckFilterInput, passesFilter } from './filter'
import { createFixContext } from './fixContext'
import { applyInlineSuspendMarkers } from './inlineSuspendMarkers'
import { createLogger, type LogLevel } from './logger'
import { CheckReport, ReportAggregate, resolveSeverityOverride } from './report'
import type { SeverityLevel } from './severity'

/**
 * Runner 选项。
 *
 * 由 CLI 或编程入口构造，把配置 + 过滤器 + reporter + baseline 路径传进来。
 */
interface RunOptions {
  config: ResolvedConfig
  filter?: CheckFilterInput
  reporters: readonly Reporter[]
  logLevel?: LogLevel
  baselinePath?: string
  /** 调用方覆盖：忽略 baseline（用于 --no-baseline 模式或 baseline:update）。 */
  ignoreBaseline?: boolean
  /** 是否打印 baseline 失效条目提醒。默认 true。 */
  warnStaleBaseline?: boolean
  /**
   * 完整运行时是否自动移除已经不再命中的 baseline 条目（**写盘**）。默认 false。
   *
   * 0.3.0 起 CLI 的 `run` / `verify` 一律不传该项：**只读命令不许改棘轮**。
   * 需要收缩基线走显式的 `arch-guard baseline prune`。
   */
  pruneStaleBaseline?: boolean
  /** stale baseline 条目是否算失败（让「已修好的债」必须被显式退役）。默认 false。 */
  failOnStale?: boolean
  /**
   * 是否对带 `Violation.applyFix` 的违规尝试自动修复。
   * `true`/`false` 覆盖配置文件 `fix`；省略则使用 `config.fix`（默认 false）。
   */
  fix?: boolean
  /** 本次 run 是否只覆盖部分文件；用于避免误判 baseline stale。 */
  fileScopeActive?: boolean
  /** 自动修复后重复检查的最大轮数（防抖动）。默认 25。 */
  maxFixIterations?: number
}

/**
 * 单次 run 的产出。
 *
 * `exitCode` 给 CLI 用，0 表示成功，1 表示有 failing violations。
 * `aggregate` 给编程入口 / 编辑器集成用。
 */
interface RunResult {
  aggregate: ReportAggregate
  /**
   * **最后一趟**扫描的豁免账（stale / matched / 撞车都读这里）。
   *
   * `--fix` 会跑多趟；只有最后一趟描述的是修完之后这棵树的状态，中间趟的账是过程量。
   */
  baselineScan?: BaselineScan
  exitCode: number
  /** baseline 相关的诊断（本次 run 是否带 filter/file scope、stale 数、内容撞车数）。 */
  baselineStatus?: BaselineRunStatus
}

interface BaselineRunStatus {
  /** only/skip/tag/file scope 是否启用——启用时 stale 判定不作数。 */
  scopeActive: boolean
  staleCount: number
  /** fingerprint 命中但内容摘要不符的条数（疑似行号撞车导致的误豁免已被挡住）。 */
  contentMismatchCount: number
  /** 内容摘要对得上、但该条目的豁免配额已用完的条数（同一形态的违规变多了）。 */
  quotaOverflowCount: number
}

/**
 * 主调度函数。
 *
 * 流程：
 *  1. 合并 plugin checks + filter，得到本次要跑的 checks
 *  2. 为每个 check 计算有效 severity（config.rules 覆盖 defaultSeverity）
 *  3. 构造共享 context，串行调用 check.run
 *  4. baseline 过滤、（可选）多轮 applyFix + 复跑、reporter 输出、exitCode 判定
 *
 * 串行执行的理由：单仓库规模下文件 IO 和 AST 解析已经被 SharedCache 复用，
 * 并行带来的复杂度（错误聚合、stdout 顺序）目前不值得引入。后续可加 workerPool。
 */
async function runArchGuard(options: RunOptions): Promise<RunResult> {
  const { config } = options
  const logger = createLogger(options.logLevel ?? 'warn')
  const filter = buildCheckFilter(options.filter)

  const allChecks = collectAllChecks(config)
  assertCheckIdUniqueness(allChecks)

  const checksToRun = allChecks.filter((check) => {
    const severity = effectiveSeverity(check, config)
    if (severity === 'off') return false
    return passesFilter(check, filter)
  })

  const sharedContext = createSharedContext({
    rootDir: config.rootDir,
    excludeDirNames: config.excludeDirNames,
    fileScope: config.files,
    logger,
  })

  const baselinePath = resolveBaselinePath(config.rootDir, options.baselinePath)
  const baseline = options.ignoreBaseline ? undefined : loadBaselineFile(baselinePath)

  // 每趟一本新账。复用同一本会让第一趟就把配额扣光，后面每趟都把存量违规判成「超出冻结份数」——
  // `run --fix` 判红而 `verify` 对同一棵树判绿。见 Baseline / BaselineScan 的分工说明。
  let baselineScan = baseline?.openScan()
  let aggregate = await executeChecksPass({
    checksToRun,
    config,
    sharedContext,
    baselineScan,
    logger,
  })

  const fixGloballyEnabled = resolveFixEnabled(options.fix, config)
  const maxFixIterations = options.maxFixIterations ?? 25
  if (fixGloballyEnabled && maxFixIterations > 0) {
    const fixContext = createFixContext(config.rootDir, logger)
    for (let iteration = 0; iteration < maxFixIterations; iteration += 1) {
      const candidates = collectFixableViolations(aggregate, config, fixGloballyEnabled)
      if (candidates.length === 0) break
      const applied = await applyScheduledFixes(candidates, fixContext, logger)
      if (applied === 0) break
      sharedContext.cache.clear()
      baselineScan = baseline?.openScan()
      aggregate = await executeChecksPass({
        checksToRun,
        config,
        sharedContext,
        baselineScan,
        logger,
      })
    }
  }

  for (const reporter of options.reporters) {
    await reporter.report(aggregate, { rootDir: config.rootDir })
  }

  let staleFailure = false
  let baselineStatus: BaselineRunStatus | undefined
  if (baselineScan) {
    // 当 only/skip/tag 过滤启用时，未跑的 check 对应的 baseline 必然 "stale"，
    // 那只是过滤副作用，不是真正的过时条目，因此跳过提示和自动清理。
    const scopeActive = isFilterActive(options.filter) || options.fileScopeActive === true
    const staleEntries = scopeActive ? [] : baselineScan.staleEntries
    const contentMismatches = baselineScan.contentMismatches.filter(
      (item) => item.kind === 'content'
    )
    const quotaOverflows = baselineScan.contentMismatches.filter((item) => item.kind === 'quota')
    baselineStatus = {
      scopeActive,
      staleCount: staleEntries.length,
      contentMismatchCount: contentMismatches.length,
      quotaOverflowCount: quotaOverflows.length,
    }

    if (contentMismatches.length > 0 && (options.warnStaleBaseline ?? true)) {
      logger.warn(
        `${contentMismatches.length} violation${contentMismatches.length === 1 ? '' : 's'} matched a baseline entry by fingerprint but not by content ` +
          '(same file/line/rule, different code). Those violations are NOT waived — review them, they are new debt.'
      )
    }
    if (quotaOverflows.length > 0 && (options.warnStaleBaseline ?? true)) {
      logger.warn(
        `${quotaOverflows.length} violation${quotaOverflows.length === 1 ? '' : 's'} match a baseline entry exactly but exceed the number of ` +
          'occurrences it froze. The extra copies are NOT waived — they are new debt.'
      )
    }

    if (!scopeActive) {
      if (staleEntries.length > 0 && options.pruneStaleBaseline) {
        writeBaselineEntriesFile(baselinePath, baselineScan.matchedEntries)
        if (options.warnStaleBaseline ?? true) {
          logger.warn(
            `${staleEntries.length} stale baseline entr${staleEntries.length === 1 ? 'y was' : 'ies were'} pruned from ${baselinePath}.`
          )
        }
      } else if (staleEntries.length > 0 && (options.warnStaleBaseline ?? true)) {
        logger.warn(
          `${staleEntries.length} baseline entr${staleEntries.length === 1 ? 'y is' : 'ies are'} stale (no longer matched). ` +
            'Run `arch-guard baseline prune` to retire them.'
        )
      }
      if (staleEntries.length > 0 && options.failOnStale === true) {
        staleFailure = true
      }
    }
  }

  return {
    aggregate,
    ...(baselineScan ? { baselineScan } : {}),
    exitCode: aggregate.hasFailures || staleFailure ? 1 : 0,
    ...(baselineStatus ? { baselineStatus } : {}),
  }
}

interface ExecuteChecksPassInput {
  checksToRun: readonly Check[]
  config: ResolvedConfig
  sharedContext: ArchGuardSharedContext
  baselineScan: BaselineScan | undefined
  logger: ReturnType<typeof createLogger>
}

async function executeChecksPass(input: ExecuteChecksPassInput): Promise<ReportAggregate> {
  const { checksToRun, config, sharedContext, baselineScan, logger } = input
  const aggregate = new ReportAggregate()

  for (const check of checksToRun) {
    const severity = effectiveSeverity(check, config)
    const report = new CheckReport(check, severity)
    const checkOptions = mergeCheckOptions(check, config)
    const runContext: CheckRunContext = {
      rootDir: config.rootDir,
      options: checkOptions,
      files: sharedContext.files,
      cache: sharedContext.cache,
      log: logger,
    }
    try {
      await check.run({ context: runContext, report })
    } catch (error) {
      report
        .section('Internal error')
        .add({
          ruleId: 'internal-error',
          message: `Check threw: ${
            error instanceof Error ? error.message : String(error)
          }`,
        })
      logger.error(`check ${check.id} threw`, error)
    }

    applySuppressedSections(report, config)
    applyInlineSuspendMarkers(report, config.rootDir, sharedContext.cache)

    if (baselineScan) {
      filterViolationsAgainstBaseline(report, baselineScan)
    }

    aggregate.add(report)
  }

  return aggregate
}

function collectAllChecks(config: ResolvedConfig): Check[] {
  const fromPlugins = config.plugins.flatMap((plugin) => plugin.checks ?? [])
  return [...config.checks, ...fromPlugins]
}

function isFilterActive(filter?: CheckFilterInput): boolean {
  return (
    (filter?.only?.length ?? 0) > 0 ||
    (filter?.skip?.length ?? 0) > 0 ||
    (filter?.tags?.length ?? 0) > 0
  )
}

function assertCheckIdUniqueness(checks: readonly Check[]): void {
  const seen = new Map<string, string>()
  for (const check of checks) {
    if (seen.has(check.id)) {
      throw new Error(
        `arch-guard: duplicate check id "${check.id}" (titles: ${seen.get(check.id)} / ${check.title}). ` +
          'Each check id must be unique across plugins and config.'
      )
    }
    seen.set(check.id, check.title)
  }
}

function effectiveSeverity(check: Check, config: ResolvedConfig): SeverityLevel {
  let fromPluginSeverities: SeverityLevel | undefined
  for (const plugin of config.plugins) {
    const override = plugin.severities?.[check.id]
    if (override !== undefined) {
      fromPluginSeverities = override
      break
    }
  }

  return resolveSeverityOverride(
    fromPluginSeverities ?? check.defaultSeverity ?? 'error',
    config.rules?.[check.id]
  )
}

function mergeCheckOptions(check: Check, config: ResolvedConfig): Readonly<Record<string, unknown>> {
  const fromPluginDefaults: Record<string, unknown> = {}
  for (const plugin of config.plugins) {
    const defaults = plugin.defaults?.[check.id]
    if (defaults) Object.assign(fromPluginDefaults, defaults)
  }

  const userRule = config.rules?.[check.id]
  const userRuleRecord =
    typeof userRule === 'object' && userRule !== null ? (userRule as Record<string, unknown>) : null
  const fromUserOptions =
    userRuleRecord?.options !== undefined
      ? (userRuleRecord.options as Record<string, unknown> | undefined) ?? {}
      : {}

  return Object.freeze({ ...fromPluginDefaults, ...fromUserOptions })
}

function applySuppressedSections(report: CheckReport, config: ResolvedConfig): void {
  const override = config.rules?.[report.check.id]
  if (typeof override !== 'object' || override === null) return
  const suppressed = (override as { suppressSections?: readonly string[] }).suppressSections
  if (!Array.isArray(suppressed) || suppressed.length === 0) return
  const suppressedSet = new Set(suppressed)
  for (const title of [...report.sections.keys()]) {
    if (suppressedSet.has(title)) {
      report.sections.delete(title)
    }
  }
}

function filterViolationsAgainstBaseline(report: CheckReport, baselineScan: BaselineScan): void {
  for (const section of report.sections.values()) {
    let writeIndex = 0
    for (let readIndex = 0; readIndex < section.violations.length; readIndex += 1) {
      const violation = section.violations[readIndex]!
      if (baselineScan.isWaived(violation)) continue
      section.violations[writeIndex] = violation
      writeIndex += 1
    }
    section.violations.length = writeIndex
  }
}

function resolveBaselinePath(rootDir: string, override?: string): string {
  if (override) return resolve(rootDir, override)
  return resolve(rootDir, '.arch-guard/baseline.json')
}

export { collectAllChecks, effectiveSeverity, isFilterActive,resolveBaselinePath, runArchGuard }
export type { BaselineRunStatus,RunOptions, RunResult }
