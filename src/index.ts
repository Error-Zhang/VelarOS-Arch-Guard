/**
 * @velaros-ai/arch-guard public runtime entrypoint.
 *
 * 该 barrel 故意只暴露"必须的公共 API"：
 * - 构造 check / plugin / config 的工厂函数与类型
 * - Runner 主调度入口
 * - Severity / Violation / Report 等核心结果模型
 *
 * Plugin-authoring helpers, built-in checks, and reporters are exposed through
 * dedicated stable entrypoints:
 *   `@velaros-ai/arch-guard/plugin`
 *   `@velaros-ai/arch-guard/checks`
 *   `@velaros-ai/arch-guard/reporters`
 */
export { defineConfig } from './config/defineConfig'
export type { LoadConfigOptions } from './config/loadConfig'
export { loadConfig } from './config/loadConfig'
export type { FileScopeConfig, ResolvedConfig, RuleOverride, UserConfig } from './config/types'
export type { BaselineEntry, BaselineFile } from './core/baseline'
export {
  Baseline,
  loadBaselineFile,
  writeBaselineEntriesFile,
  writeBaselineFile,
} from './core/baseline'
export type {
  Check,
  CheckAppliesTo,
  CheckInput,
  CheckRunContext,
  CheckRunner,
} from './core/defineCheck'
export { defineCheck, isCheck } from './core/defineCheck'
export type { Plugin, PluginInput, PluginValidateContext } from './core/definePlugin'
export { definePlugin } from './core/definePlugin'
export type { FixContext, TextReplacementOptions, TextReplacementRange } from './core/fixContext'
export { createFixContext } from './core/fixContext'
export {
  applyInlineSuspendMarkers,
  ARCH_GUARD_SUSPEND_ALL,
  ARCH_GUARD_SUSPEND_FILE,
  ARCH_GUARD_SUSPEND_LINE,
} from './core/inlineSuspendMarkers'
export type { ArchGuardLogger, LogLevel } from './core/logger'
export { createLogger } from './core/logger'
export type { ReportSummary } from './core/report'
export {
  CheckReport,
  CheckReportSection,
  ReportAggregate,
  resolveSeverityOverride,
} from './core/report'
export type { RunOptions, RunResult } from './core/runner'
export { collectAllChecks, effectiveSeverity, resolveBaselinePath, runArchGuard } from './core/runner'
export type { SeverityLevel } from './core/severity'
export { coerceSeverity, isFailingSeverity, maxSeverity } from './core/severity'
export type { Violation, ViolationInput } from './core/violation'
export { computeFingerprint, violationKey } from './core/violation'
