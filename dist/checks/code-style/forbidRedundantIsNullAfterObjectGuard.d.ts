/**
 * `!isObject(x) && !isNull(x)` 在 **`||` 链中且左侧已有可排除 null 的子式** 时，`!isNull(x)` 恒为 true。
 *
 * 典型来源：`typeof x !== 'object'` 自动修复为 `!isObject(x) && !isNull(x)` 后，又与 `!x` / `x == null` /
 * `isNull(x)` 等并写，产生冗余。
 *
 * 允许的左侧子式（在其为**假**时，可确定 `x` 已非 null）：
 * - `!x`（truthy 分支）
 * - `x == null` / `x === null`（含对侧为 `null` 的写法）
 * - `isNull(x)`（返回 false 时）
 */
declare const forbidRedundantIsNullAfterObjectGuard: import("../../index.js").Check;
export { forbidRedundantIsNullAfterObjectGuard };
//# sourceMappingURL=forbidRedundantIsNullAfterObjectGuard.d.ts.map