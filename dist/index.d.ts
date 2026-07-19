/**
 * @velaros/arch-guard public runtime entrypoint.
 *
 * 该 barrel 故意只暴露"必须的公共 API"：
 * - 构造 check / plugin / config 的工厂函数与类型
 * - Runner 主调度入口
 * - Severity / Violation / Report 等核心结果模型
 *
 * Plugin-authoring helpers, built-in checks, and reporters are exposed through
 * dedicated stable entrypoints:
 *   `@velaros/arch-guard/plugin`
 *   `@velaros/arch-guard/checks`
 *   `@velaros/arch-guard/reporters`
 */
export { defineConfig } from './config/defineConfig.js';
export type { LoadConfigOptions } from './config/loadConfig.js';
export { loadConfig } from './config/loadConfig.js';
export type { FileScopeConfig, ResolvedConfig, RuleOverride, UserConfig } from './config/types.js';
export type { BaselineEntry, BaselineFile } from './core/baseline.js';
export { Baseline, loadBaselineFile, writeBaselineEntriesFile, writeBaselineFile, } from './core/baseline.js';
export type { Check, CheckAppliesTo, CheckInput, CheckRunContext, CheckRunner, } from './core/defineCheck.js';
export { defineCheck, isCheck } from './core/defineCheck.js';
export type { Plugin, PluginInput, PluginValidateContext } from './core/definePlugin.js';
export { definePlugin } from './core/definePlugin.js';
export type { FixContext, TextReplacementOptions, TextReplacementRange } from './core/fixContext.js';
export { createFixContext } from './core/fixContext.js';
export { applyInlineSuspendMarkers, ARCH_GUARD_SUSPEND_ALL, ARCH_GUARD_SUSPEND_FILE, ARCH_GUARD_SUSPEND_LINE, } from './core/inlineSuspendMarkers.js';
export type { ArchGuardLogger, LogLevel } from './core/logger.js';
export { createLogger } from './core/logger.js';
export type { ReportSummary } from './core/report.js';
export { CheckReport, CheckReportSection, ReportAggregate, resolveSeverityOverride, } from './core/report.js';
export type { RunOptions, RunResult } from './core/runner.js';
export { collectAllChecks, effectiveSeverity, resolveBaselinePath, runArchGuard } from './core/runner.js';
export type { SeverityLevel } from './core/severity.js';
export { coerceSeverity, isFailingSeverity, maxSeverity } from './core/severity.js';
export type { Violation, ViolationInput } from './core/violation.js';
export { computeFingerprint, violationKey } from './core/violation.js';
//# sourceMappingURL=index.d.ts.map