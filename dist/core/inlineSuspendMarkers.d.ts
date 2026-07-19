import type { SharedCache } from './context.js';
import type { CheckReport } from './report.js';
/** 单行/邻近行：暂缓指定 check 或 rule 在某个位置的报告。 */
declare const ARCH_GUARD_SUSPEND_LINE = "@arch-guard:suspend";
/** 文件头：暂缓整个文件内某 check 的报告（仅扫描文件前若干行）。 */
declare const ARCH_GUARD_SUSPEND_FILE = "@arch-guard:suspend-file";
/** 通配暂缓（同一行邻近标记）：仅在「理由」足够长时使用。 */
declare const ARCH_GUARD_SUSPEND_ALL = "*";
/**
 * 在 baseline 过滤前调用：删掉被 `@arch-guard:suspend*` 合规覆盖的违规。
 */
declare function applyInlineSuspendMarkers(report: CheckReport, rootDir: string, cache: SharedCache): void;
export { applyInlineSuspendMarkers, ARCH_GUARD_SUSPEND_ALL, ARCH_GUARD_SUSPEND_FILE, ARCH_GUARD_SUSPEND_LINE, };
//# sourceMappingURL=inlineSuspendMarkers.d.ts.map