import { loadConfig } from '../../config/loadConfig'
import { resolveBaselinePath, runArchGuard } from '../../core/runner'
import type { Reporter } from '../../reporters/types'
import { type ParsedArgs, resolveCliFix, toBoolean, toString, toStringArray } from '../argv'
import { applyCliFileScope } from '../fileScope'

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

  const result = await runArchGuard({
    config: fileScope.config,
    filter: {
      only: toStringArray(args.options.only),
      skip: toStringArray(args.options.skip),
      tags: toStringArray(args.options.tag),
    },
    reporters: [silentReporter],
    logLevel: 'error',
    ignoreBaseline: toBoolean(args.options['no-baseline']),
    baselinePath: toString(args.options['baseline-path']) ?? resolveBaselinePath(config.rootDir),
    warnStaleBaseline: false,
    fix: resolveCliFix(args),
    fileScopeActive: fileScope.active,
  })

  const summary = result.aggregate.summary()
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
    }
    console.info(JSON.stringify(payload, null, 2))
    return result.exitCode
  }

  if (result.exitCode === 0) {
    console.info(`arch-guard: PASS (${summary.totalChecks} checks).`)
    return 0
  }

  const failing = failingChecks.map((failing) => `${failing.id}(${failing.violations})`).join(', ')
  console.info(
    `arch-guard: FAIL — ${summary.failingChecks}/${summary.totalChecks} checks failing, ${summary.totalViolations} violation(s). Failing: ${failing}.`
  )
  return result.exitCode
}

export { verifyCommand }
