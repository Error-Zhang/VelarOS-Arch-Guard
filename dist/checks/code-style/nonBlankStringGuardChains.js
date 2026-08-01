import ts from 'typescript';
import { enclosingConditionalIfDirectCondition, unwrapParensExpression as unwrapParens } from './_shared.js';
import { flattenAndOperands, topOfAndChain } from './plainObjectRawAndTriple.js';
/**
 * `typeof x === 'string'`（含 `==`）+ **`!!x.trim()`** / **`x.trim()`** / **`Boolean(x.trim())`** 的扁平 `&&`、及 **三元 `… ? …trim() : ''`**；
 * 供 **prefer-is-non-blank-string-guard**、**prefer-trimmed-string-or-empty-ternary** 与 **forbid-raw-runtime-type-guards** 对可一步收成 **`isNonBlankString` / `trimmedStringOrEmpty`** 的 `typeof 'string'` 子式 **退让**。
 */
function expressionsTextEqual(a, b, sourceFile) {
    return a.getText(sourceFile) === b.getText(sourceFile);
}
function enclosingTopAndChain(node) {
    let cur = node;
    while (cur) {
        if (ts.isBinaryExpression(cur) && cur.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken)
            return topOfAndChain(cur);
        cur = cur.parent;
    }
    return undefined;
}
function tryParseTypeofEqualsStringOperand(node) {
    if (!ts.isBinaryExpression(node))
        return undefined;
    const op = node.operatorToken.kind;
    if (op !== ts.SyntaxKind.EqualsEqualsEqualsToken && op !== ts.SyntaxKind.EqualsEqualsToken)
        return undefined;
    if (ts.isTypeOfExpression(node.left) && ts.isStringLiteral(node.right) && node.right.text === 'string')
        return node.left.expression;
    if (ts.isTypeOfExpression(node.right) && ts.isStringLiteral(node.left) && node.left.text === 'string')
        return node.right.expression;
    return undefined;
}
function readGlobalIsStringCallArg(expr) {
    const u = unwrapParens(expr);
    if (!ts.isCallExpression(u) || u.arguments.length !== 1)
        return undefined;
    if (!ts.isIdentifier(u.expression) || u.expression.text !== 'isString')
        return undefined;
    const arg = u.arguments[0];
    return arg ? unwrapParens(arg) : undefined;
}
function extractStringGuardSubject(part) {
    const isn = readGlobalIsStringCallArg(part);
    if (isn)
        return isn;
    const u = unwrapParens(part);
    if (!ts.isBinaryExpression(u))
        return undefined;
    return tryParseTypeofEqualsStringOperand(u);
}
function stripLeadingDoubleBang(expr) {
    const e = unwrapParens(expr);
    if (!ts.isPrefixUnaryExpression(e) || e.operator !== ts.SyntaxKind.ExclamationToken)
        return undefined;
    const once = unwrapParens(e.operand);
    if (!ts.isPrefixUnaryExpression(once) || once.operator !== ts.SyntaxKind.ExclamationToken)
        return undefined;
    return unwrapParens(once.operand);
}
function unwrapBooleanCall(expr) {
    const e = unwrapParens(expr);
    if (!ts.isCallExpression(e) || e.arguments.length !== 1)
        return undefined;
    const callee = unwrapParens(e.expression);
    if (!ts.isIdentifier(callee) || callee.text !== 'Boolean')
        return undefined;
    const arg = e.arguments[0];
    return arg ? unwrapParens(arg) : undefined;
}
function parseTrimCallSubject(expr) {
    const e = unwrapParens(expr);
    if (!ts.isCallExpression(e) || e.arguments.length !== 0)
        return undefined;
    const recv = unwrapParens(e.expression);
    if (!ts.isPropertyAccessExpression(recv))
        return undefined;
    if (recv.name.text !== 'trim')
        return undefined;
    return recv.expression;
}
/** `!!x.trim()`、`x.trim()`、`Boolean(x.trim())` → `x`（须为零参 `.trim()`）。 */
function readTrimTruthySubject(expr) {
    const u = unwrapParens(expr);
    const afterBang = stripLeadingDoubleBang(u);
    const core = afterBang ?? u;
    const boolWrapped = unwrapBooleanCall(core);
    const inner = boolWrapped ?? core;
    return parseTrimCallSubject(inner);
}
/** `&&` 上二元：`isString` / **`typeof === 'string'`** 与 trim 真值子式，顺序任意。 */
function matchNonBlankStringPositiveAndPair(parts, sourceFile) {
    if (parts.length !== 2)
        return undefined;
    const first = parts[0];
    const second = parts[1];
    if (!first || !second)
        return undefined;
    const orders = [
        [first, second],
        [second, first],
    ];
    for (const [guardPart, trimPart] of orders) {
        const subjStr = extractStringGuardSubject(guardPart);
        const subjTrim = readTrimTruthySubject(trimPart);
        if (subjStr && subjTrim && expressionsTextEqual(subjStr, subjTrim, sourceFile))
            return subjStr;
    }
    return undefined;
}
function isEmptyStringLiteralExpression(expr) {
    const u = unwrapParens(expr);
    return ts.isStringLiteral(u) && u.text === '';
}
/** `isString(x)` / `typeof x === 'string'` + `x.trim()` + `: ''` 三元（whenTrue 须为零参 `.trim()`）。 */
function matchTrimmedStringOrEmptyTernary(node, sourceFile) {
    const subjCond = extractStringGuardSubject(node.condition);
    if (!subjCond)
        return undefined;
    const trimRecv = parseTrimCallSubject(node.whenTrue);
    if (!trimRecv)
        return undefined;
    if (!expressionsTextEqual(subjCond, trimRecv, sourceFile))
        return undefined;
    if (!isEmptyStringLiteralExpression(node.whenFalse))
        return undefined;
    return subjCond;
}
/** forbid-raw：`typeof x === 'string'` 为 **`trimmedStringOrEmpty`** 三元条件时跳过。 */
function shouldSkipTypeofStringEqForTrimmedStringOrEmptyTernary(node, sourceFile) {
    const op = node.operatorToken.kind;
    if (op !== ts.SyntaxKind.EqualsEqualsEqualsToken && op !== ts.SyntaxKind.EqualsEqualsToken)
        return false;
    if (!tryParseTypeofEqualsStringOperand(unwrapParens(node)))
        return false;
    const ce = enclosingConditionalIfDirectCondition(node);
    if (!ce)
        return false;
    return matchTrimmedStringOrEmptyTernary(ce, sourceFile) !== undefined;
}
function sliceContainsNode(slice, node) {
    return slice.includes(node);
}
/** forbid-raw：`typeof x === 'string'`（含 `==`）在可收成 **`isNonBlankString`** 的 **正** `&&` 二元内时跳过。 */
function shouldSkipTypeofStringEqForNonBlankAndPair(node, sourceFile) {
    const op = node.operatorToken.kind;
    if (op !== ts.SyntaxKind.EqualsEqualsEqualsToken && op !== ts.SyntaxKind.EqualsEqualsToken)
        return false;
    if (!tryParseTypeofEqualsStringOperand(unwrapParens(node)))
        return false;
    const top = enclosingTopAndChain(node);
    if (!top)
        return false;
    const parts = flattenAndOperands(top);
    for (let i = 0; i <= parts.length - 2; i += 1) {
        const slice = parts.slice(i, i + 2);
        if (!matchNonBlankStringPositiveAndPair(slice, sourceFile))
            continue;
        if (sliceContainsNode(slice, node))
            return true;
    }
    return false;
}
export { expressionsTextEqual, matchNonBlankStringPositiveAndPair, matchTrimmedStringOrEmptyTernary, shouldSkipTypeofStringEqForNonBlankAndPair, shouldSkipTypeofStringEqForTrimmedStringOrEmptyTernary, };
export { unwrapParensExpression as unwrapParens } from './_shared.js';
//# sourceMappingURL=nonBlankStringGuardChains.js.map