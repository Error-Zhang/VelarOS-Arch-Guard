/** 工厂：创建并冻结一个 Plugin。 */
function definePlugin(input) {
    if (!input.name) {
        throw new Error('arch-guard: definePlugin requires a non-empty name.');
    }
    return Object.freeze({ ...input });
}
export { definePlugin };
//# sourceMappingURL=definePlugin.js.map