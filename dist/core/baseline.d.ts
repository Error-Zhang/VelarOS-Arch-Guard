import { type Violation } from './violation.js';
/**
 * Baseline 记录格式。
 *
 * - 每条 entry 用 fingerprint 索引，runner 启动时加载，违规列表在输出前会按 baseline 过滤。
 * - 同时保留 message 摘要用于人类阅读和 review diff。
 *
 * Baseline 文件 schema 故意非常简单，便于 git diff 审查；写入时按 key 排序。
 */
interface BaselineEntry {
    checkId: string;
    ruleId: string;
    fingerprint: string;
    message: string;
    file?: string;
    addedAt?: string;
}
interface BaselineFile {
    version: 1;
    entries: readonly BaselineEntry[];
}
/**
 * 内存中的 baseline：构造时加载，查询时按 violationKey 命中。
 * 还会跟踪哪些 baseline 条目"应该出现但未出现"（stale），帮助清理。
 */
declare class Baseline {
    private readonly entries;
    private readonly hits;
    constructor(entries: readonly BaselineEntry[]);
    /** 是否被 baseline 豁免；命中时把该 entry 标记为已使用。 */
    isWaived(violation: Violation): boolean;
    /** 本次 run 中未被任何违规命中的 baseline 条目（清理候选）。 */
    get staleEntries(): BaselineEntry[];
    /** 本次 run 仍然命中的 baseline 条目，可用于移除已解决的 stale entries。 */
    get matchedEntries(): BaselineEntry[];
}
/** 从磁盘加载 baseline 文件。文件不存在时返回空 baseline。 */
declare function loadBaselineFile(filePath: string): Baseline;
/** 把当前 violations 序列化成 baseline 文件，原子写盘。 */
declare function writeBaselineFile(filePath: string, violations: readonly Violation[]): void;
/** 把 baseline entries 原样写回，保留现有 message / file / addedAt 元数据。 */
declare function writeBaselineEntriesFile(filePath: string, entries: readonly BaselineEntry[]): void;
export { Baseline, loadBaselineFile, writeBaselineEntriesFile, writeBaselineFile };
export type { BaselineEntry, BaselineFile };
//# sourceMappingURL=baseline.d.ts.map