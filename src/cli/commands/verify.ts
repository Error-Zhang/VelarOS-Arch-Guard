import { loadConfig } from '../../config/loadConfig'
import type { BaselineRunStatus } from '../../core/runner'
import { resolveBaselinePath, runArchGuard } from '../../core/runner'
import type { Reporter } from '../../reporters/types'
import { type ParsedArgs, resolveCliFix, toBoolean, toString, toStringArray } from '../argv'
import { applyCliFileScope, describeEmptyFileScope } from '../fileScope'

/**
 * `arch-guard verify`：CI / AI agent 友好的短输出。
 *
 * 默认只打一行总结到 stdout，让自动化工具方便判断成败：
 *   stdout: `arch-guard: PASS (14 checks)` 或 `arch-guard: FAIL — 3/14 checks failing, 222 violations.`
 *   exit code: 0 表示成功，1 表示有 failing checks，2 表示运行时错误
 *
 * 加 `--json` 会输出结构化结果，包含每个 check 的违规数、severity 分布、failing checks 列表：
 *   { "ok": false, "exitCode": 1, "summary": {...}, "failing": [{ id, violations, sections }] }
 *
 * 与 `run` 的区别：verify 不打印每条违规，只产出"通过/失败 + 概览"，适合：
 *   - CI 主流程（只需判定 PR 是否通过）
 *   - AI agent 自我验证（不消耗大量 token 读违规明细）
 *   - 在更大的 check pipeline 里只关心结果
 */
async function verifyCommand(args: ParsedArgs): Promise<number> {
  const config = await loadConfig({
    configPath: toString(args.options.config),
    rootDir: toString(args.options.root),
  })
  const fileScope = applyCliFileScope(config, args)

  const asJson = toBoolean(args.options.json)
  const silentReporter: Reporter = { name: 'silent', report() {} }
  const emptyScope = describeEmptyFileScope(fileScope)

  const result = await runArchGuard({
    config: fileScope.config,
    filter: {
      only: toStringArray(args.options.only),
      skip: toStringArray(args.options.skip),
      tags: toStringArray(args.options.tag),
    },
    reporters: [silentReporter],
    // 默认 warn，不是 error。`verify --fix` 是 CLI 支持的组合（`resolveCliFix` 也认它），
    // 而「这次修复被拒了」「改写落盘了但 import 没补上」都是 warn 档——钉死在 error 档
    // 等于让 `verify --fix` 每一条被拒的修复都静默。verify 的一行结论走 stdout，
    // 这些告警走 stderr，短输出契约不受影响。显式 --log-level 仍然优先。
    logLevel: resolveVerifyLogLevel(args),
    ignoreBaseline: toBoolean(args.options['no-baseline']),
    baselinePath: toString(args.options['baseline-path']) ?? resolveBaselinePath(config.rootDir),
    warnStaleBaseline: false,
    failOnStale: toBoolean(args.options['fail-on-stale']),
    fix: resolveCliFix(args),
    fileScopeActive: fileScope.active,
  })

  const summary = result.aggregate.summary()
  const baselineStatus = result.baselineStatus
  const failingChecks = result.aggregate.failingReports.map((report) => ({
    id: report.check.id,
    title: report.check.title,
    violations: report.violations.length,
    sections: report.failedSections.map((section) => ({
      title: section.title,
      violations: section.violations.length,
    })),
  }))

  if (asJson) {
    const payload = {
      ok: result.exitCode === 0,
      exitCode: result.exitCode,
      summary,
      failing: failingChecks,
      // 只在真发生时出现：机器消费方要能把「零文件」与「零违规」分开，而现有 payload 形状不变。
      ...(emptyScope !== undefined ? { emptyFileScope: emptyScope } : {}),
      ...(baselineStatus ? { baseline: baselineStatus } : {}),
    }
    console.info(JSON.stringify(payload, null, 2))
    return result.exitCode
  }

  const baselineNote = describeBaselineStatus(baselineStatus)
  // PASS 在空作用域下是最危险的一句话：读的人以为代码过检了，实际一个文件都没扫。
  const scopeNote = emptyScope === undefined ? '' : ` — NOTE: ${emptyScope}, so no file was scanned.`

  if (result.exitCode === 0) {
    console.info(`arch-guard: PASS (${summary.totalChecks} checks).${baselineNote}${scopeNote}`)
    return 0
  }

  if (failingChecks.length === 0) {
    console.info(
      `arch-guard: FAIL — no failing checks, but the baseline has ${baselineStatus?.staleCount ?? 0} stale entr${
        baselineStatus?.staleCount === 1 ? 'y' : 'ies'
      } and --fail-on-stale is set. Retire them with \`arch-guard baseline prune\`.`
    )
    return result.exitCode
  }

  const failing = failingChecks.map((failing) => `${failing.id}(${failing.violations})`).join(', ')
  console.info(
    `arch-guard: FAIL — ${summary.failingChecks}/${summary.totalChecks} checks failing, ${summary.totalViolations} violation(s). Failing: ${failing}.${baselineNote}${scopeNote}`
  )
  return result.exitCode
}

/**
 * verify 的日志档：显式 `--log-level` 优先，否则 `warn`。
 *
 * 0.2.x 钉死 `error`，于是 `verify --fix` 下 `reportDeclinedFixes` 与「改写了但没补 import」
 * 这两条 warn 全部消失——被拒的修复一条都看不见。verify 平时在 warn 档本来就基本无声
 * （stale / 撞车提示都被 `warnStaleBaseline: false` 关掉了），放开它不会污染短输出。
 */
function resolveVerifyLogLevel(args: ParsedArgs): 'error' | 'warn' | 'info' | 'debug' {
  const explicit = toString(args.options['log-level'])
  if (explicit === 'error' || explicit === 'warn' || explicit === 'info' || explicit === 'debug') {
    return explicit
  }
  return 'warn'
}

/** 一行 baseline 健康度尾注：stale 数与内容撞车数（0 时不打扰）。 */
function describeBaselineStatus(status: BaselineRunStatus | undefined): string {
  if (!status || status.scopeActive) return ''
  const notes: string[] = []
  if (status.staleCount > 0) notes.push(`${status.staleCount} stale baseline entries`)
  if (status.contentMismatchCount > 0) {
    notes.push(`${status.contentMismatchCount} baseline content mismatches`)
  }
  if (status.quotaOverflowCount > 0) {
    notes.push(`${status.quotaOverflowCount} beyond the frozen occurrence count`)
  }
  return notes.length > 0 ? ` (${notes.join(', ')})` : ''
}

export { verifyCommand }
