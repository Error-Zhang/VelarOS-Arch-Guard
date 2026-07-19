import { existsSync, readFileSync } from 'node:fs';
import { writeFileAtomically } from '../utils/atomicWrite.js';
import { violationKey } from './violation.js';
/**
 * 内存中的 baseline：构造时加载，查询时按 violationKey 命中。
 * 还会跟踪哪些 baseline 条目"应该出现但未出现"（stale），帮助清理。
 */
class Baseline {
    entries;
    hits = new Set();
    constructor(entries) {
        this.entries = new Map(entries.map((entry) => [keyFromBaselineEntry(entry), entry]));
    }
    /** 是否被 baseline 豁免；命中时把该 entry 标记为已使用。 */
    isWaived(violation) {
        const key = violationKey(violation);
        if (this.entries.has(key)) {
            this.hits.add(key);
            return true;
        }
        return false;
    }
    /** 本次 run 中未被任何违规命中的 baseline 条目（清理候选）。 */
    get staleEntries() {
        const result = [];
        for (const [key, entry] of this.entries) {
            if (!this.hits.has(key)) {
                result.push(entry);
            }
        }
        return result;
    }
    /** 本次 run 仍然命中的 baseline 条目，可用于移除已解决的 stale entries。 */
    get matchedEntries() {
        const result = [];
        for (const [key, entry] of this.entries) {
            if (this.hits.has(key)) {
                result.push(entry);
            }
        }
        return result;
    }
}
function keyFromBaselineEntry(entry) {
    return `${entry.checkId}::${entry.ruleId}::${entry.fingerprint}`;
}
/** 从磁盘加载 baseline 文件。文件不存在时返回空 baseline。 */
function loadBaselineFile(filePath) {
    if (!existsSync(filePath))
        return new Baseline([]);
    const text = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(text);
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.entries)) {
        throw new Error(`arch-guard: invalid baseline file at ${filePath}`);
    }
    return new Baseline(parsed.entries);
}
/** 把当前 violations 序列化成 baseline 文件，原子写盘。 */
function writeBaselineFile(filePath, violations) {
    const entries = violations
        .map((violation) => {
        const entry = {
            checkId: violation.checkId,
            ruleId: violation.ruleId,
            fingerprint: violation.fingerprint,
            message: violation.message,
        };
        if (violation.file !== undefined)
            entry.file = violation.file;
        return entry;
    });
    writeBaselineEntriesFile(filePath, entries);
}
/** 把 baseline entries 原样写回，保留现有 message / file / addedAt 元数据。 */
function writeBaselineEntriesFile(filePath, entries) {
    const sortedEntries = [...entries].sort((a, b) => keyFromBaselineEntry(a).localeCompare(keyFromBaselineEntry(b)));
    const payload = {
        version: 1,
        entries: sortedEntries,
    };
    writeFileAtomically(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}
export { Baseline, loadBaselineFile, writeBaselineEntriesFile, writeBaselineFile };
//# sourceMappingURL=baseline.js.map