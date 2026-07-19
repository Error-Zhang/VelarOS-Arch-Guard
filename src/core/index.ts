export type { BaselineEntry, BaselineFile } from './baseline'
export {
  Baseline,
  loadBaselineFile,
  writeBaselineEntriesFile,
  writeBaselineFile,
} from './baseline'
export type { ArchGuardSharedContext } from './context'
export { createSharedContext, DefaultExcludeDirNames, FileCollections, SharedCache } from './context'
export type { Check, CheckAppliesTo, CheckInput, CheckRunContext, CheckRunner } from './defineCheck'
export { defineCheck, isCheck } from './defineCheck'
export type { Plugin, PluginInput, PluginValidateContext } from './definePlugin'
export { definePlugin } from './definePlugin'
export type { CheckFilter, CheckFilterInput } from './filter'
export { buildCheckFilter, passesFilter } from './filter'
export type { FixContext, TextReplacementOptions, TextReplacementRange } from './fixContext'
export { createFixContext } from './fixContext'
export {
  applyInlineSuspendMarkers,
  ARCH_GUARD_SUSPEND_ALL,
  ARCH_GUARD_SUSPEND_FILE,
  ARCH_GUARD_SUSPEND_LINE,
} from './inlineSuspendMarkers'
export type { ArchGuardLogger, LogLevel } from './logger'
export { createLogger } from './logger'
export type { ReportSummary } from './report'
export { CheckReport, CheckReportSection, ReportAggregate, resolveSeverityOverride } from './report'
export type { RunOptions, RunResult } from './runner'
export { collectAllChecks, effectiveSeverity, resolveBaselinePath, runArchGuard } from './runner'
export type { SeverityLevel } from './severity'
export { coerceSeverity, isFailingSeverity, maxSeverity, SeverityRank } from './severity'
export type { Violation, ViolationInput } from './violation'
export { computeFingerprint, violationKey } from './violation'
