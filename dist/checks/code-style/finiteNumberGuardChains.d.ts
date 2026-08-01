import ts from 'typescript';
/**
 * `isFiniteNumber(x)`（`isNumber(x) && Number.isFinite(x)`）与 **De Morgan** `!isFiniteNumber(x)` 的扁平链识别；
 * 另含 **`isNumber(x) ? x : null`** / **`typeof`** 三元 → **`numberOrNull`**；
 * 供 **prefer-is-finite-number-guard**、**prefer-number-or-null-ternary** 与 **forbid-raw-runtime-type-guards** 跳过会破坏整段改写的 `typeof 'number'` 子式。
 */
declare function unwrapParens(expr: ts.Expression): ts.Expression;
declare function expressionsTextEqual(a: ts.Expression, b: ts.Expression, sourceFile: ts.SourceFile): boolean;
/** `&&` 上二元：`isNumber`/`typeof==='number'` 与 `Number.isFinite`，顺序任意。 */
declare function matchFiniteNumberPositiveAndPair(parts: ts.Expression[], sourceFile: ts.SourceFile): ts.Expression | undefined;
/** `||` 上二元：`!isNumber`/`typeof !== 'number'` 与 `!Number.isFinite`，顺序任意。 */
declare function matchFiniteNumberRejectOrPair(parts: ts.Expression[], sourceFile: ts.SourceFile): ts.Expression | undefined;
/** forbid-raw：`typeof x === 'number'`（含 `==`）在 **正** `&&` 二元（收 `isFiniteNumber`）内时跳过。 */
declare function shouldSkipTypeofNumberEqForFiniteAndPair(node: ts.BinaryExpression, sourceFile: ts.SourceFile): boolean;
/** forbid-raw：`typeof x !== 'number'`（含 `!=`）在 **拒** `||` 二元内时跳过。 */
declare function shouldSkipTypeofNumberNeForFiniteOrPair(node: ts.BinaryExpression, sourceFile: ts.SourceFile): boolean;
/** `isNumber(x)` / `typeof x === 'number'` + 同式 + `: null` 三元。 */
declare function matchNumberOrNullTernary(node: ts.ConditionalExpression, sourceFile: ts.SourceFile): ts.Expression | undefined;
/** forbid-raw：`typeof x === 'number'` 为 **`numberOrNull`** 三元条件时跳过。 */
declare function shouldSkipTypeofNumberEqForNumberOrNullTernary(node: ts.BinaryExpression, sourceFile: ts.SourceFile): boolean;
export { expressionsTextEqual, matchFiniteNumberPositiveAndPair, matchFiniteNumberRejectOrPair, matchNumberOrNullTernary, shouldSkipTypeofNumberEqForFiniteAndPair, shouldSkipTypeofNumberEqForNumberOrNullTernary, shouldSkipTypeofNumberNeForFiniteOrPair, unwrapParens, };
//# sourceMappingURL=finiteNumberGuardChains.d.ts.map