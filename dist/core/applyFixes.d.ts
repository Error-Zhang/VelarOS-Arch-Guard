import type { ResolvedConfig } from '../config/types.js';
import type { InternalFixContext } from './fixContext.js';
import type { ArchGuardLogger } from './logger.js';
import type { ReportAggregate } from './report.js';
import type { Violation } from './violation.js';
/** CLI `fix` 优先于配置文件 `config.fix`；`undefined` 表示沿用配置。 */
declare function resolveFixEnabled(cliFix: boolean | undefined, config: ResolvedConfig): boolean;
declare function collectFixableViolations(aggregate: ReportAggregate, config: ResolvedConfig, globalFix: boolean): Violation[];
/**
 * 应用本轮修复。
 *
 * 顺序铁律：**先做全部区间替换，最后统一补 import**。fixer 持有的是本轮解析时的 offset，
 * 而 import 插在文件头会把后面所有 offset 顶掉——先补 import 就会让同文件其余替换切错位置。
 * flush 时重新读盘，因此不受前面替换的影响。
 */
declare function applyScheduledFixes(violations: readonly Violation[], ctx: InternalFixContext, log: ArchGuardLogger): Promise<number>;
export { applyScheduledFixes, collectFixableViolations, resolveFixEnabled };
//# sourceMappingURL=applyFixes.d.ts.map