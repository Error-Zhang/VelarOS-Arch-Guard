const SeverityRank = {
    off: -1,
    info: 0,
    warning: 1,
    error: 2,
};
/** 是否构成 CI 失败（仅 error）。 */
function isFailingSeverity(level) {
    return level === 'error';
}
/** 严重级别排序：取两个之中更高的那个。 */
function maxSeverity(a, b) {
    return SeverityRank[a] >= SeverityRank[b] ? a : b;
}
/** 把任意字符串收窄到合法 SeverityLevel，无法识别时返回 fallback。 */
function coerceSeverity(value, fallback = 'error') {
    if (value === 'error' || value === 'warning' || value === 'info' || value === 'off')
        return value;
    return fallback;
}
export { coerceSeverity, isFailingSeverity, maxSeverity, SeverityRank };
//# sourceMappingURL=severity.js.map