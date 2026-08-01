/**
 * - **`isNumber(x) && Number.isFinite(x)`**（顺序任意），或 **`typeof x === 'number'`**（/`==`）与 **`Number.isFinite(x)`** → **`isFiniteNumber(x)`**。
 * - **`!isNumber(x) || !Number.isFinite(x)`**，或 **`typeof x !== 'number'`**（/`!=`）与 **`!Number.isFinite(x)`** → **`!isFiniteNumber(x)`**。
 * - 可与 **`prefer-is-plain-object`** 同类：链上其它子式保留；`&&` 上可吸收紧前同参 **truthy** 守卫（`x` / `!!x`）。
 */
declare const preferIsFiniteNumberGuard: import("../../index.js").Check;
export { preferIsFiniteNumberGuard };
//# sourceMappingURL=preferIsFiniteNumberGuard.d.ts.map