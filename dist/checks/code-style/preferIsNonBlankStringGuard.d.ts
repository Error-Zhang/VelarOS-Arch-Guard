/**
 * **`isString(x)`** 或 **`typeof x === 'string'`**（含 `==`），与 **`!!x.trim()`** / **`x.trim()`** / **`Boolean(x.trim())`**（顺序任意）→ **`isNonBlankString(x)`**。
 * 可与 **finite-number** 同类：链上其它子式保留；`&&` 上可吸收紧前同参 **truthy** 守卫（`x` / `!!x`）。
 */
declare const preferIsNonBlankStringGuard: import("../../index.js").Check;
export { preferIsNonBlankStringGuard };
//# sourceMappingURL=preferIsNonBlankStringGuard.d.ts.map