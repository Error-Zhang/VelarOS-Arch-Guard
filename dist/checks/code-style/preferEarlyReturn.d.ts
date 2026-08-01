/**
 * 函数体内连续嵌套 `if (cond) { if (cond2) { if (cond3) { ... } } }` 超过阈值时报告。
 * 这是 anti-pyramid 守门员，鼓励先 guard early-return / 反转条件，让主路径走在最外层。
 *
 * 计数逻辑：从函数入口算起，沿"单 if + 单分支体"路径累计 if 嵌套深度（不计入 else 分支、不计入循环）。
 * 一旦深度超过 MaxIfNestingDepth，提示重构。
 */
declare const preferEarlyReturn: import("../../index.js").Check;
export { preferEarlyReturn };
//# sourceMappingURL=preferEarlyReturn.d.ts.map