/**
 * 标记与 `undefined` / **`null`** / `true` / `false` 的 `===` / `!==`，以及 **`typeof expr ===/!== 'undefined'`**（字符串字面量）。
 *
 * 优先改为 **`isNull` / `isNotNull` / `isPresent`**、**`Object.is(x, undefined)`**、**`globalThis.*` 可选链**、`??`、`!!` 等简写。
 *
 * **`typeof x === 'object' && x !== null` 整段**：不由本规则对中间的 `!== null` 单独报 `compare-null`（否则会误导成只改成 `isNotNull`）；请见 **`code-style/forbid-raw-runtime-type-guards`**，**优先合并为 `isObject(x)`**。
 *
 * 仍需旧式写法时在命中行上方使用 `@arch-guard:suspend code-style/forbid-redundant-strict-literal-comparison 理由：…`。
 */
declare const forbidRedundantStrictLiteralComparison: import("../../index.js").Check;
export { forbidRedundantStrictLiteralComparison };
//# sourceMappingURL=forbidRedundantStrictLiteralComparison.d.ts.map