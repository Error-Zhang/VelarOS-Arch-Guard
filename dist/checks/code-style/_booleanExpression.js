import ts from 'typescript';
import { unwrapParensExpression } from './_shared.js';
function formatBooleanCondition(condition, sourceFile) {
    const unwrapped = unwrapParensExpression(condition);
    if (isSyntacticBooleanExpression(unwrapped))
        return unwrapped.getText(sourceFile);
    return `!!${formatPrefixOperand(unwrapped, sourceFile)}`;
}
function formatNegatedCondition(condition, sourceFile) {
    const unwrapped = unwrapParensExpression(condition);
    if (ts.isPrefixUnaryExpression(unwrapped) &&
        unwrapped.operator === ts.SyntaxKind.ExclamationToken)
        return formatBooleanCondition(unwrapped.operand, sourceFile);
    return `!${formatPrefixOperand(unwrapped, sourceFile)}`;
}
function formatConditionForAnd(condition, sourceFile) {
    const unwrapped = unwrapParensExpression(condition);
    if (isSyntacticBooleanExpression(unwrapped)) {
        if (ts.isBinaryExpression(unwrapped))
            return `(${unwrapped.getText(sourceFile)})`;
        if (ts.isConditionalExpression(unwrapped))
            return `(${unwrapped.getText(sourceFile)})`;
        return unwrapped.getText(sourceFile);
    }
    return `!!${formatPrefixOperand(unwrapped, sourceFile)}`;
}
function formatPrefixOperand(expression, sourceFile) {
    const text = expression.getText(sourceFile);
    if (ts.isIdentifier(expression) ||
        expression.kind === ts.SyntaxKind.ThisKeyword ||
        expression.kind === ts.SyntaxKind.SuperKeyword ||
        ts.isCallExpression(expression) ||
        ts.isPropertyAccessExpression(expression) ||
        ts.isElementAccessExpression(expression) ||
        ts.isNonNullExpression(expression))
        return text;
    return `(${text})`;
}
const BooleanBinaryOperators = new Set([
    ts.SyntaxKind.EqualsEqualsEqualsToken,
    ts.SyntaxKind.ExclamationEqualsEqualsToken,
    ts.SyntaxKind.EqualsEqualsToken,
    ts.SyntaxKind.ExclamationEqualsToken,
    ts.SyntaxKind.LessThanToken,
    ts.SyntaxKind.LessThanEqualsToken,
    ts.SyntaxKind.GreaterThanToken,
    ts.SyntaxKind.GreaterThanEqualsToken,
    ts.SyntaxKind.InKeyword,
    ts.SyntaxKind.InstanceOfKeyword,
]);
function isSyntacticBooleanExpression(expression) {
    const unwrapped = unwrapParensExpression(expression);
    if (unwrapped.kind === ts.SyntaxKind.TrueKeyword || unwrapped.kind === ts.SyntaxKind.FalseKeyword)
        return true;
    if (ts.isPrefixUnaryExpression(unwrapped) &&
        unwrapped.operator === ts.SyntaxKind.ExclamationToken)
        return true;
    if (ts.isBinaryExpression(unwrapped)) {
        if (BooleanBinaryOperators.has(unwrapped.operatorToken.kind))
            return true;
        if (unwrapped.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
            unwrapped.operatorToken.kind === ts.SyntaxKind.BarBarToken)
            return (isSyntacticBooleanExpression(unwrapped.left) &&
                isSyntacticBooleanExpression(unwrapped.right));
        return false;
    }
    const name = readBooleanCandidateName(unwrapped);
    return name ? isBooleanishName(name) : false;
}
function readBooleanCandidateName(expression) {
    const unwrapped = unwrapParensExpression(expression);
    if (ts.isIdentifier(unwrapped))
        return unwrapped.text;
    if (ts.isPropertyAccessExpression(unwrapped))
        return unwrapped.name.text;
    if (ts.isNonNullExpression(unwrapped))
        return readBooleanCandidateName(unwrapped.expression);
    if (ts.isCallExpression(unwrapped)) {
        const callee = unwrapParensExpression(unwrapped.expression);
        if (ts.isIdentifier(callee))
            return callee.text;
        if (ts.isPropertyAccessExpression(callee))
            return callee.name.text;
    }
    return undefined;
}
const BooleanNameExact = new Set([
    'active',
    'open',
    'selected',
    'checked',
    'disabled',
    'enabled',
    'expanded',
    'collapsed',
    'running',
    'spinning',
    'capturing',
    'conflict',
    'partial',
    'loading',
    'loaded',
    'dragging',
    'removable',
    'activatable',
    'clickable',
    'pinned',
    'dirty',
    'visible',
    'available',
]);
const BooleanNameSuffixes = [
    'active',
    'open',
    'selected',
    'checked',
    'disabled',
    'enabled',
    'expanded',
    'collapsed',
    'running',
    'spinning',
    'capturing',
    'conflict',
    'partial',
    'loading',
    'loaded',
    'dragging',
    'removable',
    'activatable',
    'clickable',
    'pinned',
    'dirty',
    'visible',
    'available',
    'inline',
];
function isBooleanishName(name) {
    const lowerName = name.toLowerCase();
    if (BooleanNameExact.has(lowerName))
        return true;
    if (BooleanNameSuffixes.some((suffix) => lowerName.endsWith(suffix)))
        return true;
    if (/^(is|has|can|should|allow|show|hide)[A-Z_]/.test(name))
        return true;
    return /[a-z](Is|Has|Can|Should|Allow|Show|Hide)[A-Z_]/.test(name);
}
export { formatBooleanCondition, formatConditionForAnd, formatNegatedCondition, isSyntacticBooleanExpression, };
//# sourceMappingURL=_booleanExpression.js.map