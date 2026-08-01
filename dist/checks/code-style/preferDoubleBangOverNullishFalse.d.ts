/**
 * `expr ?? false` 在 **仅以 null/undefined 为缺席哨兵、希望得到 boolean** 时，应写成 `!!expr`（必要时对左侧加括号）。
 *
 * 当左侧已经是 `!!sub` 时，`?? false` 恒多余，修复为删去 `?? false`。
 *
 * 注意：若左侧在非 nullish 时可能是 **非 boolean** 的 falsy（如 `0`、`''`），`?? false` 与 `!!` 语义不同；此类场景不要用本修复 blindly，应收紧类型或改用显式分支。
 */
declare const preferDoubleBangOverNullishFalse: import("../../index.js").Check;
export { preferDoubleBangOverNullishFalse };
//# sourceMappingURL=preferDoubleBangOverNullishFalse.d.ts.map