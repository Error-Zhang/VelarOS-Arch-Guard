import { type Violation } from './violation.js';
/**
 * Baseline 记录格式。
 *
 * - 每条 entry 用 fingerprint 索引，runner 启动时加载，违规列表在输出前会按 baseline 过滤。
 * - 同时保留 message 摘要用于人类阅读和 review diff。
 * - `contentDigest` 是**第二道身份**：fingerprint 只由 check 提供的 `fingerprintInput` 决定，
 *   而多数规则的 `fingerprintInput` 形如 `file::line::kind`——**不含表达式本文**，同文件同行同规则
 *   的**不同**违规会撞成同一个 fingerprint，于是棘轮会把一条它从没见过的新违规当成存量放行。
 *   带 `contentDigest` 的条目要求 fingerprint 与内容摘要**同时**命中才豁免；不带的条目按旧口径
 *   （只比 fingerprint）工作，保证旧基线零迁移可用。
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
    /**
     * 违规内容摘要（与行号无关）。存在时参与豁免判定：fingerprint 命中但内容不符 = 不豁免。
     * 由 `baseline update` / `baseline migrate` 写入；旧基线没有该字段，行为与 0.2.0 完全一致。
     */
    contentDigest?: string;
    /**
     * 该条目豁免**几条**同 (指纹, 内容摘要) 的违规。缺省 = 1。
     *
     * 只对带 `contentDigest` 的条目有意义：一次查表式豁免（不计数）等于把同一行同一形态的
     * 违规复制 N 份也照样全绿——`isWaived` 是 Map 查找，一条冻结记录可以无限次命中。
     * 摘要本身解决不了这个：三份逐字相同的表达式摘要也相同。所以身份 = (指纹, 摘要, 配额)。
     *
     * 没有摘要的旧条目**不计数**（配额无限），这样 ≤0.2.x 写下的基线一字不改、行为完全一致；
     * `baseline migrate` 给它们补上摘要与配额，那一步才是收紧。
     */
    count?: number;
}
interface BaselineFile {
    version: 1;
    entries: readonly BaselineEntry[];
}
/** 指纹命中但没能豁免的记录——审查用，说明基线里冻的不是眼前这条（或者已经冻满了）。 */
interface BaselineContentMismatch {
    entry: BaselineEntry;
    /** 当前这条同 fingerprint 的违规。 */
    violation: Violation;
    /**
     * `content` = 该指纹下所有条目的内容摘要都对不上（行号撞车，冻的是另一条违规）；
     * `quota`   = 内容对得上，但这条冻结记录的配额已经用完（同形态违规变多了）。
     */
    kind: 'content' | 'quota';
}
/** 一个豁免键下的额度：条目本体 + 总配额。**不可变**——用了多少记在 {@link BaselineScan} 里。 */
interface WaiverSlot {
    entries: readonly BaselineEntry[];
    /** `undefined` = 无限（没有内容摘要的 ≤0.2.x 旧条目，保持原行为）。 */
    capacity: number | undefined;
}
/**
 * 内存中的 baseline：一份**只读**的冻结事实，构造时加载，查询时按 violationKey 命中。
 *
 * 这里不存「本趟用掉了多少配额」。判定带副作用是个陷阱：`--fix` 会把同一份 baseline
 * 连着跑好几趟（每轮修复后重跑全部 check），查一次扣一次的话，第二趟拿到的是被第一趟
 * 耗尽的配额，于是本该豁免的存量违规集体变红——`run --fix` 判红、`verify` 判绿，
 * 同一棵树两个答案。账要单独开：见 {@link BaselineScan}。
 */
declare class Baseline {
    /** `checkId::ruleId::fingerprint::<digest|*>` → 额度。同一指纹可以冻多条不同内容。 */
    private readonly slots;
    /** `checkId::ruleId::fingerprint` → 该指纹下的全部条目，用于识别「撞上了但内容不符」。 */
    private readonly byFingerprint;
    constructor(entries: readonly BaselineEntry[]);
    /**
     * 开一本新账，用来过一遍**一趟**扫描的违规。
     *
     * 每趟一本：账本不共享，配额就不可能跨趟串味。想多跑一趟的调用方只需要再开一本，
     * 不需要记得「重置」什么——没有可忘的步骤，就没有这一类 bug。
     */
    openScan(): BaselineScan;
    /** 指纹相同的条目是否多于一条——说明该指纹本身没有区分力。 */
    get collidingFingerprintCount(): number;
    /** 全部条目（含未命中），供 baseline 命令做合并写回。 */
    get allEntries(): BaselineEntry[];
}
/**
 * 一趟扫描的豁免账：配额消耗与指纹撞车都记在这里，{@link Baseline} 本身一个字节都不改。
 *
 * `staleEntries` / `matchedEntries` 说的都是「**这一趟**」的事实。多趟运行（`--fix`）应当
 * 每趟开一本新账，并以最后一趟为准——那才是修完之后这棵树的真实状态。
 */
declare class BaselineScan {
    private readonly slots;
    private readonly byFingerprint;
    /** 豁免键 → 本趟已用配额。 */
    private readonly used;
    private readonly mismatches;
    /** 由 {@link Baseline.openScan} 构造：冻结事实只读传入，账本归本对象。 */
    constructor(slots: ReadonlyMap<string, WaiverSlot>, byFingerprint: ReadonlyMap<string, readonly BaselineEntry[]>);
    /** 是否被 baseline 豁免；命中时在**本账**上扣掉一份配额。 */
    isWaived(violation: Violation): boolean;
    private consume;
    /** 本趟中未被任何违规命中的 baseline 条目（清理候选）。 */
    get staleEntries(): BaselineEntry[];
    /**
     * 本趟仍然命中的 baseline 条目，**配额收缩到实际用量**。
     *
     * `prune` 写的就是这份：配额 3 只用掉 1 的条目留着 2 份空白支票，那和 stale 条目是同一种债。
     */
    get matchedEntries(): BaselineEntry[];
    /** 指纹撞上但没豁免的记录——审查用，说明基线里冻的不是眼前这条。 */
    get contentMismatches(): readonly BaselineContentMismatch[];
}
/**
 * 把一批条目按豁免键收敛成「一条 + 配额」。
 *
 * 写入口（`baseline update`）用它：同一 (指纹, 内容摘要) 的 N 条违规必须冻成 `count: N`，
 * 而不是去重成一条。去重会让重冻本身变成一张空白支票——同形态的第 N+1 条以后永远不红；
 * 不去重又会让 `update` 之后紧跟的 `verify` 立刻判红（配额只有 1，却有 N 条要豁免），
 * 也就是 `update` 不再幂等。
 */
declare function collapseEntriesByWaiverKey(entries: readonly BaselineEntry[]): BaselineEntry[];
/** 一条条目当前占用的配额（缺省 1）。 */
declare function entryWaiverCount(entry: BaselineEntry): number;
declare function keyFromBaselineEntry(entry: BaselineEntry): string;
/**
 * 豁免键：指纹 + 内容摘要。
 *
 * 一个指纹可以合法地冻着**多条**内容不同的违规（`file::line::kind` 这类 fingerprintInput
 * 本来就区分不出同行的两条），所以基线按 (指纹, 摘要) 存，不按指纹去重——否则全仓重冻之后
 * 同指纹的第二条会立刻判红，`baseline update` 就不再是幂等的。没有摘要的旧条目用 `*` 通配。
 */
declare function waiverKeyFromBaselineEntry(entry: BaselineEntry): string;
/**
 * 从违规 message 里剥掉开头的 `path:line:` / `path:line:column:` 定位前缀。
 *
 * 内容摘要要对**行号漂移免疫**：加一行 import、上面插一段注释，都不该让摘要变化。
 * 只剥开头的定位前缀，消息正文里真正描述内容的部分（代码片段、标识符名）原样保留。
 */
declare function normalizeMessageForContentDigest(message: string): string;
/** 计算违规的内容摘要（与行号无关）。 */
declare function contentDigestForMessage(message: string): string;
/** 从磁盘加载 baseline 文件。文件不存在时返回空 baseline。 */
declare function loadBaselineFile(filePath: string): Baseline;
/** 读出 baseline 条目数组（文件不存在时为空）。 */
declare function readBaselineEntries(filePath: string): BaselineEntry[];
/** 把一条违规转成 baseline 条目（带内容摘要）。 */
declare function baselineEntryFromViolation(violation: Violation): BaselineEntry;
/** 把当前 violations 序列化成 baseline 文件，原子写盘。 */
declare function writeBaselineFile(filePath: string, violations: readonly Violation[]): void;
/**
 * 把 baseline entries 原样写回，保留现有 message / file / addedAt 元数据。
 *
 * 内容一模一样时**连文件都不碰**：改了 mtime 就会惊动 watcher / 增量构建，也让
 * 「这条命令到底动没动棘轮」这个问题多一种含糊答案。写盘面只有一种诚实形态——变了才写。
 */
declare function writeBaselineEntriesFile(filePath: string, entries: readonly BaselineEntry[]): void;
/** 序列化成最终文件内容（按豁免键排序，便于 git diff 审查）。 */
declare function serializeBaselineEntries(entries: readonly BaselineEntry[]): string;
export { Baseline, baselineEntryFromViolation, BaselineScan, collapseEntriesByWaiverKey, contentDigestForMessage, entryWaiverCount, keyFromBaselineEntry, loadBaselineFile, normalizeMessageForContentDigest, readBaselineEntries, serializeBaselineEntries, waiverKeyFromBaselineEntry, writeBaselineEntriesFile, writeBaselineFile, };
export type { BaselineContentMismatch, BaselineEntry, BaselineFile };
//# sourceMappingURL=baseline.d.ts.map