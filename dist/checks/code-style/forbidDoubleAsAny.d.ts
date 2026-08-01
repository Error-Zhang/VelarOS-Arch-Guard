/**
 * 历史 opt-in 规则：禁止把 any 当跳板的双重断言。
 *
 * VelarOS 默认 code-style checks 不再注册本规则：动态边界、第三方库、测试替身等场景可以直接用 any，
 * 不再强迫通过 unknown 做双重断言。若某个子项目想重新收紧，可显式启用这条 legacy check。
 */
declare const forbidDoubleAsAny: import("../../index.js").Check;
export { forbidDoubleAsAny };
//# sourceMappingURL=forbidDoubleAsAny.d.ts.map