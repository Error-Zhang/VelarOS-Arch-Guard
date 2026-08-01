import ts from 'typescript';
declare function topOfAndChain(node: ts.BinaryExpression): ts.BinaryExpression;
declare function topOfOrChain(node: ts.BinaryExpression): ts.BinaryExpression;
declare function flattenOrChainOperands(expr: ts.Expression): ts.Expression[];
declare function flattenAndOperands(expr: ts.Expression): ts.Expression[];
/** `||` 上三连：falsy/nullish、非 object、数组三槽各一条；顺序任意；与 `!isPlainObject(x)` 等价。 */
declare function matchRejectPlainObjectOrTriple(parts: ts.Expression[], sourceFile: ts.SourceFile): ts.Expression | undefined;
declare function matchRejectPlainObjectOrDeMorganPair(parts: ts.Expression[], sourceFile: ts.SourceFile): ts.Expression | undefined;
declare function matchPlainObjectPositiveRawTriple(parts: ts.Expression[], sourceFile: ts.SourceFile): ts.Expression | undefined;
/** forbid-raw：`typeof&&!null` 合并会妨碍 isPlainObject 一步到位时跳过。 */
declare function shouldSkipMergeTypeofObjectNotNull(mergeNode: ts.BinaryExpression, sourceFile: ts.SourceFile): boolean;
/** forbid-raw：`Array.isArray` → `isArray`：在 **正** plain `&&` 三连的 `!Array.isArray` 内，或在 **拒** plain `||` 三连的 **正** `Array.isArray` 臂上时跳过（由 prefer 一次替换整链）。 */
declare function shouldSkipBareArrayIsArrayCall(call: ts.CallExpression, sourceFile: ts.SourceFile): boolean;
/** forbid-raw：`typeof x === 'object'` 单独改 isObject 会破坏三连时跳过。 */
declare function shouldSkipTypeofObjectStrictEqBinary(node: ts.BinaryExpression, sourceFile: ts.SourceFile): boolean;
/** forbid-raw：`typeof x !== 'object'` / `typeof x != 'object'` 在 **拒** plain `||` 三连或 **De Morgan 二连** 内时跳过。 */
declare function shouldSkipTypeofObjectNotEqForRejectTriple(node: ts.BinaryExpression, sourceFile: ts.SourceFile): boolean;
export { flattenAndOperands, flattenOrChainOperands, matchPlainObjectPositiveRawTriple, matchRejectPlainObjectOrDeMorganPair, matchRejectPlainObjectOrTriple, shouldSkipBareArrayIsArrayCall, shouldSkipMergeTypeofObjectNotNull, shouldSkipTypeofObjectNotEqForRejectTriple, shouldSkipTypeofObjectStrictEqBinary, topOfAndChain, topOfOrChain, };
//# sourceMappingURL=plainObjectRawAndTriple.d.ts.map