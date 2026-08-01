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
export { defineConfig } from './config/defineConfig.js';
export { loadConfig } from './config/loadConfig.js';
export { Baseline, BaselineScan, loadBaselineFile, writeBaselineEntriesFile, writeBaselineFile, } from './core/baseline.js';
export { defineCheck, isCheck } from './core/defineCheck.js';
export { definePlugin } from './core/definePlugin.js';
export { createFixContext } from './core/fixContext.js';
export { applyInlineSuspendMarkers, ARCH_GUARD_SUSPEND_ALL, ARCH_GUARD_SUSPEND_FILE, ARCH_GUARD_SUSPEND_LINE, } from './core/inlineSuspendMarkers.js';
export { createLogger } from './core/logger.js';
export { CheckReport, CheckReportSection, ReportAggregate, resolveSeverityOverride, } from './core/report.js';
export { collectAllChecks, effectiveSeverity, resolveBaselinePath, runArchGuard } from './core/runner.js';
export { coerceSeverity, isFailingSeverity, maxSeverity } from './core/severity.js';
export { computeFingerprint, violationKey } from './core/violation.js';
//# sourceMappingURL=index.js.map