import { existsSync, readFileSync } from 'node:fs';
import { writeFileAtomically } from '../utils/atomicWrite.js';
import { computeFingerprint, violationKey } from './violation.js';
/**
 * 内存中的 baseline：一份**只读**的冻结事实，构造时加载，查询时按 violationKey 命中。
 *
 * 这里不存「本趟用掉了多少配额」。判定带副作用是个陷阱：`--fix` 会把同一份 baseline
 * 连着跑好几趟（每轮修复后重跑全部 check），查一次扣一次的话，第二趟拿到的是被第一趟
 * 耗尽的配额，于是本该豁免的存量违规集体变红——`run --fix` 判红、`verify` 判绿，
 * 同一棵树两个答案。账要单独开：见 {@link BaselineScan}。
 */
class Baseline {
    /** `checkId::ruleId::fingerprint::<digest|*>` → 额度。同一指纹可以冻多条不同内容。 */
    slots;
    /** `checkId::ruleId::fingerprint` → 该指纹下的全部条目，用于识别「撞上了但内容不符」。 */
    byFingerprint;
    constructor(entries) {
        const slots = new Map();
        const byFingerprint = new Map();
        for (const entry of entries) {
            const waiverKey = waiverKeyFromBaselineEntry(entry);
            const slot = slots.get(waiverKey) ?? { entries: [], capacity: 0 };
            slot.entries.push(entry);
            slot.capacity =
                entry.contentDigest === undefined
                    ? undefined
                    : slot.capacity === undefined
                        ? undefined
                        : slot.capacity + normalizeEntryCount(entry.count);
            slots.set(waiverKey, slot);
            const key = keyFromBaselineEntry(entry);
            const bucket = byFingerprint.get(key);
            if (bucket)
                bucket.push(entry);
            else
                byFingerprint.set(key, [entry]);
        }
        this.slots = slots;
        this.byFingerprint = byFingerprint;
    }
    /**
     * 开一本新账，用来过一遍**一趟**扫描的违规。
     *
     * 每趟一本：账本不共享，配额就不可能跨趟串味。想多跑一趟的调用方只需要再开一本，
     * 不需要记得「重置」什么——没有可忘的步骤，就没有这一类 bug。
     */
    openScan() {
        return new BaselineScan(this.slots, this.byFingerprint);
    }
    /** 指纹相同的条目是否多于一条——说明该指纹本身没有区分力。 */
    get collidingFingerprintCount() {
        let count = 0;
        for (const bucket of this.byFingerprint.values()) {
            if (bucket.length > 1)
                count += 1;
        }
        return count;
    }
    /** 全部条目（含未命中），供 baseline 命令做合并写回。 */
    get allEntries() {
        const result = [];
        for (const slot of this.slots.values())
            result.push(...slot.entries);
        return result;
    }
}
/**
 * 一趟扫描的豁免账：配额消耗与指纹撞车都记在这里，{@link Baseline} 本身一个字节都不改。
 *
 * `staleEntries` / `matchedEntries` 说的都是「**这一趟**」的事实。多趟运行（`--fix`）应当
 * 每趟开一本新账，并以最后一趟为准——那才是修完之后这棵树的真实状态。
 */
class BaselineScan {
    slots;
    byFingerprint;
    /** 豁免键 → 本趟已用配额。 */
    used = new Map();
    mismatches = [];
    /** 由 {@link Baseline.openScan} 构造：冻结事实只读传入，账本归本对象。 */
    constructor(slots, byFingerprint) {
        this.slots = slots;
        this.byFingerprint = byFingerprint;
    }
    /** 是否被 baseline 豁免；命中时在**本账**上扣掉一份配额。 */
    isWaived(violation) {
        const key = violationKey(violation);
        const bucket = this.byFingerprint.get(key);
        if (!bucket || bucket.length === 0)
            return false;
        // 精确命中：指纹与内容摘要都对上，且还有配额。
        const exactKey = `${key}::${contentDigestOfViolation(violation)}`;
        const exact = this.slots.get(exactKey);
        if (exact && this.consume(exactKey, exact))
            return true;
        // 旧条目（≤0.2.x 写下、没有摘要）：沿用只比指纹、不计数的口径，旧基线零迁移可用。
        const legacyKey = `${key}::*`;
        const legacy = this.slots.get(legacyKey);
        if (legacy && this.consume(legacyKey, legacy))
            return true;
        this.mismatches.push({
            entry: (exact?.entries[0] ?? bucket[0]),
            violation,
            kind: exact ? 'quota' : 'content',
        });
        return false;
    }
    consume(waiverKey, slot) {
        const used = this.used.get(waiverKey) ?? 0;
        if (slot.capacity !== undefined && used >= slot.capacity)
            return false;
        this.used.set(waiverKey, used + 1);
        return true;
    }
    /** 本趟中未被任何违规命中的 baseline 条目（清理候选）。 */
    get staleEntries() {
        const result = [];
        for (const [waiverKey, slot] of this.slots) {
            if ((this.used.get(waiverKey) ?? 0) === 0)
                result.push(...slot.entries);
        }
        return result;
    }
    /**
     * 本趟仍然命中的 baseline 条目，**配额收缩到实际用量**。
     *
     * `prune` 写的就是这份：配额 3 只用掉 1 的条目留着 2 份空白支票，那和 stale 条目是同一种债。
     */
    get matchedEntries() {
        const result = [];
        for (const [waiverKey, slot] of this.slots) {
            const used = this.used.get(waiverKey) ?? 0;
            if (used === 0)
                continue;
            if (slot.capacity === undefined) {
                // 无限配额的旧条目：prune 不给它们补摘要，也就无从收缩，原样留着。
                result.push(...slot.entries);
                continue;
            }
            // 同一豁免键下的条目内容逐字相同（指纹相同 → 同文件同行同规则；摘要相同 → 同内容），
            // 合并成一条带配额的记录是无损的。
            result.push(withEntryCount(slot.entries[0], used));
        }
        return result;
    }
    /** 指纹撞上但没豁免的记录——审查用，说明基线里冻的不是眼前这条。 */
    get contentMismatches() {
        return this.mismatches;
    }
}
/** 配额解析：缺席 / 非法值一律当 1，不当无限——身份字段出错时必须收紧而不是放宽。 */
function normalizeEntryCount(count) {
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 1)
        return 1;
    return count;
}
/** 写回时省略 `count: 1`，让绝大多数条目与 0.2.x 的形状逐字一致。 */
function withEntryCount(entry, count) {
    if (count <= 1) {
        const { count: _dropped, ...rest } = entry;
        return rest;
    }
    return { ...entry, count };
}
/**
 * 把一批条目按豁免键收敛成「一条 + 配额」。
 *
 * 写入口（`baseline update`）用它：同一 (指纹, 内容摘要) 的 N 条违规必须冻成 `count: N`，
 * 而不是去重成一条。去重会让重冻本身变成一张空白支票——同形态的第 N+1 条以后永远不红；
 * 不去重又会让 `update` 之后紧跟的 `verify` 立刻判红（配额只有 1，却有 N 条要豁免），
 * 也就是 `update` 不再幂等。
 */
function collapseEntriesByWaiverKey(entries) {
    const order = [];
    const byKey = new Map();
    for (const entry of entries) {
        const key = waiverKeyFromBaselineEntry(entry);
        const existing = byKey.get(key);
        if (existing) {
            existing.count += normalizeEntryCount(entry.count);
            continue;
        }
        order.push(key);
        byKey.set(key, { entry, count: normalizeEntryCount(entry.count) });
    }
    return order.map((key) => {
        const slot = byKey.get(key);
        return withEntryCount(slot.entry, slot.count);
    });
}
/** 一条条目当前占用的配额（缺省 1）。 */
function entryWaiverCount(entry) {
    return normalizeEntryCount(entry.count);
}
function keyFromBaselineEntry(entry) {
    return `${entry.checkId}::${entry.ruleId}::${entry.fingerprint}`;
}
/**
 * 豁免键：指纹 + 内容摘要。
 *
 * 一个指纹可以合法地冻着**多条**内容不同的违规（`file::line::kind` 这类 fingerprintInput
 * 本来就区分不出同行的两条），所以基线按 (指纹, 摘要) 存，不按指纹去重——否则全仓重冻之后
 * 同指纹的第二条会立刻判红，`baseline update` 就不再是幂等的。没有摘要的旧条目用 `*` 通配。
 */
function waiverKeyFromBaselineEntry(entry) {
    return `${keyFromBaselineEntry(entry)}::${entry.contentDigest ?? '*'}`;
}
/**
 * 从违规 message 里剥掉开头的 `path:line:` / `path:line:column:` 定位前缀。
 *
 * 内容摘要要对**行号漂移免疫**：加一行 import、上面插一段注释，都不该让摘要变化。
 * 只剥开头的定位前缀，消息正文里真正描述内容的部分（代码片段、标识符名）原样保留。
 */
function normalizeMessageForContentDigest(message) {
    return message.replace(/^(\S*?):(\d+)(?::(\d+))?:\s?/, '$1: ');
}
/** 计算违规的内容摘要（与行号无关）。 */
function contentDigestForMessage(message) {
    return computeFingerprint(['content:v1', normalizeMessageForContentDigest(message)]);
}
function contentDigestOfViolation(violation) {
    return contentDigestForMessage(violation.message);
}
/** 从磁盘加载 baseline 文件。文件不存在时返回空 baseline。 */
function loadBaselineFile(filePath) {
    return new Baseline(readBaselineEntries(filePath));
}
/** 读出 baseline 条目数组（文件不存在时为空）。 */
function readBaselineEntries(filePath) {
    if (!existsSync(filePath))
        return [];
    const text = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(text);
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.entries)) {
        throw new Error(`arch-guard: invalid baseline file at ${filePath}`);
    }
    return [...parsed.entries];
}
/** 把一条违规转成 baseline 条目（带内容摘要）。 */
function baselineEntryFromViolation(violation) {
    const entry = {
        checkId: violation.checkId,
        ruleId: violation.ruleId,
        fingerprint: violation.fingerprint,
        message: violation.message,
        contentDigest: contentDigestOfViolation(violation),
    };
    if (violation.file !== undefined)
        entry.file = violation.file;
    return entry;
}
/** 把当前 violations 序列化成 baseline 文件，原子写盘。 */
function writeBaselineFile(filePath, violations) {
    writeBaselineEntriesFile(filePath, violations.map(baselineEntryFromViolation));
}
/**
 * 把 baseline entries 原样写回，保留现有 message / file / addedAt 元数据。
 *
 * 内容一模一样时**连文件都不碰**：改了 mtime 就会惊动 watcher / 增量构建，也让
 * 「这条命令到底动没动棘轮」这个问题多一种含糊答案。写盘面只有一种诚实形态——变了才写。
 */
function writeBaselineEntriesFile(filePath, entries) {
    const next = serializeBaselineEntries(entries);
    if (existsSync(filePath) && readFileSync(filePath, 'utf-8') === next)
        return;
    writeFileAtomically(filePath, next);
}
/** 序列化成最终文件内容（按豁免键排序，便于 git diff 审查）。 */
function serializeBaselineEntries(entries) {
    const sortedEntries = [...entries].sort((a, b) => waiverKeyFromBaselineEntry(a).localeCompare(waiverKeyFromBaselineEntry(b)));
    const payload = {
        version: 1,
        entries: sortedEntries,
    };
    return `${JSON.stringify(payload, null, 2)}\n`;
}
export { Baseline, baselineEntryFromViolation, BaselineScan, collapseEntriesByWaiverKey, contentDigestForMessage, entryWaiverCount, keyFromBaselineEntry, loadBaselineFile, normalizeMessageForContentDigest, readBaselineEntries, serializeBaselineEntries, waiverKeyFromBaselineEntry, writeBaselineEntriesFile, writeBaselineFile, };
//# sourceMappingURL=baseline.js.map