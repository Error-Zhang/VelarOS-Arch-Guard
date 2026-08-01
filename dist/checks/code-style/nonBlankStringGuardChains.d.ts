import ts from 'typescript';
/**
 * `typeof x === 'string'`（含 `==`）+ **`!!x.trim()`** / **`x.trim()`** / **`Boolean(x.trim())`** 的扁平 `&&`、及 **三元 `… ? …trim() : ''`**；
 * 供 **prefer-is-non-blank-string-guard**、**prefer-trimmed-string-or-empty-ternary** 与 **forbid-raw-runtime-type-guards** 对可一步收成 **`isNonBlankString` / `trimmedStringOrEmpty`** 的 `typeof 'string'` 子式 **退让**。
 */
declare function expressionsTextEqual(a: ts.Expression, b: ts.Expression, sourceFile: ts.SourceFile): boolean;
/** `&&` 上二元：`isString` / **`typeof === 'string'`** 与 trim 真值子式，顺序任意。 */
declare function matchNonBlankStringPositiveAndPair(parts: ts.Expression[], sourceFile: ts.SourceFile): ts.Expression | undefined;
/** `isString(x)` / `typeof x === 'string'` + `x.trim()` + `: ''` 三元（whenTrue 须为零参 `.trim()`）。 */
declare function matchTrimmedStringOrEmptyTernary(node: ts.ConditionalExpression, sourceFile: ts.SourceFile): ts.Expression | undefined;
/** forbid-raw：`typeof x === 'string'` 为 **`trimmedStringOrEmpty`** 三元条件时跳过。 */
declare function shouldSkipTypeofStringEqForTrimmedStringOrEmptyTernary(node: ts.BinaryExpression, sourceFile: ts.SourceFile): boolean;
/** forbid-raw：`typeof x === 'string'`（含 `==`）在可收成 **`isNonBlankString`** 的 **正** `&&` 二元内时跳过。 */
declare function shouldSkipTypeofStringEqForNonBlankAndPair(node: ts.BinaryExpression, sourceFile: ts.SourceFile): boolean;
export { expressionsTextEqual, matchNonBlankStringPositiveAndPair, matchTrimmedStringOrEmptyTernary, shouldSkipTypeofStringEqForNonBlankAndPair, shouldSkipTypeofStringEqForTrimmedStringOrEmptyTernary, };
export { unwrapParensExpression as unwrapParens } from './_shared.js';
//# sourceMappingURL=nonBlankStringGuardChains.d.ts.map