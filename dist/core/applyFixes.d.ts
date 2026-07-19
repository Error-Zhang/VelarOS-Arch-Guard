import type { ResolvedConfig } from '../config/types.js';
import type { FixContext } from './fixContext.js';
import type { ArchGuardLogger } from './logger.js';
import type { ReportAggregate } from './report.js';
import type { Violation } from './violation.js';
/** CLI `fix` 优先于配置文件 `config.fix`；`undefined` 表示沿用配置。 */
declare function resolveFixEnabled(cliFix: boolean | undefined, config: ResolvedConfig): boolean;
declare function collectFixableViolations(aggregate: ReportAggregate, config: ResolvedConfig, globalFix: boolean): Violation[];
declare function applyScheduledFixes(violations: readonly Violation[], ctx: FixContext, log: ArchGuardLogger): Promise<number>;
export { applyScheduledFixes, collectFixableViolations, resolveFixEnabled };
//# sourceMappingURL=applyFixes.d.ts.map