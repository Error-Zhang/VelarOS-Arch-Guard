function buildCheckFilter(input) {
    return {
        only: input?.only ? new Set(input.only) : undefined,
        skip: input?.skip ? new Set(input.skip) : undefined,
        tags: input?.tags ? new Set(input.tags) : undefined,
    };
}
/** 判定一个 check 是否应被执行。 */
function passesFilter(check, filter) {
    if (filter.only && filter.only.size > 0 && !filter.only.has(check.id))
        return false;
    if (filter.skip && filter.skip.has(check.id))
        return false;
    if (filter.tags && filter.tags.size > 0) {
        const checkTags = check.tags ?? [];
        const hasTag = checkTags.some((tag) => filter.tags.has(tag));
        if (!hasTag)
            return false;
    }
    return true;
}
export { buildCheckFilter, passesFilter };
//# sourceMappingURL=filter.js.map