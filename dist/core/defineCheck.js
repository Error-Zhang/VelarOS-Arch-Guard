/** 工厂：创建并冻结一个 Check 定义，并做基本校验。 */
function defineCheck(input) {
    if (!input.id || typeof input.id !== 'string') {
        throw new Error('arch-guard: defineCheck requires a non-empty string id.');
    }
    if (!input.title || !input.description) {
        throw new Error(`arch-guard: check ${input.id} must define title and description.`);
    }
    if (!Array.isArray(input.verifies) || input.verifies.length === 0) {
        throw new Error(`arch-guard: check ${input.id} must describe what it verifies.`);
    }
    if (typeof input.run !== 'function') {
        throw new Error(`arch-guard: check ${input.id} must provide a run function.`);
    }
    return Object.freeze({
        ...input,
        defaultSeverity: input.defaultSeverity ?? 'error',
    });
}
/** 类型守卫：判断一个对象是否是合法的 Check 定义。 */
function isCheck(value) {
    return (typeof value === 'object' &&
        value !== null &&
        typeof value.id === 'string' &&
        typeof value.run === 'function');
}
export { defineCheck, isCheck };
//# sourceMappingURL=defineCheck.js.map