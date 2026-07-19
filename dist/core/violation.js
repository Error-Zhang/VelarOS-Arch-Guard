import { createHash } from 'node:crypto';
/** 生成 fingerprint：稳定的短 hash，用于 baseline 比对。 */
function computeFingerprint(parts) {
    const hash = createHash('sha1');
    for (const part of parts) {
        hash.update(part ?? '');
        hash.update('\u0000');
    }
    return hash.digest('hex').slice(0, 16);
}
/** 序列化 violation 为 baseline 友好的字符串 key。 */
function violationKey(violation) {
    return `${violation.checkId}::${violation.ruleId}::${violation.fingerprint}`;
}
export { computeFingerprint, violationKey };
//# sourceMappingURL=violation.js.map