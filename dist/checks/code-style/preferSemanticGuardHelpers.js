import { defineCheck } from '../../core/defineCheck.js';
import ts from 'typescript';
import { fixReplaceSpan, readHelperImportSources } from './_fix.js';
import { collectCodeStyleFiles, getCachedSourceFile, lineOf, snippetOf, walk } from './_shared.js';
import { CodeStyleFixPhase } from './fixPhases.js';
const preferSemanticGuardHelpers = defineCheck({
    id: 'code-style/prefer-semantic-guard-helpers',
    title: 'Prefer semantic guard helpers',
    description: '将常见 guard 样板合并为全局 helper：isNonEmptyArray(value)、isPositiveNumber(value)。',
    verifies: [
        '`isArray(x) && !x.isEmpty` → `isNonEmptyArray(x)`。',
        '`isNumber(x) && x > 0` → `isPositiveNumber(x)`。',
        '`arch-guard run --fix` 就地替换源码。',
    ],
    tags: ['code-style', 'type-guards'],
    defaultSeverity: 'error',
    run({ context, report }) {
        const section = report.section('Prefer semantic guard helpers');
        const helpers = readHelperImportSources(context);
        for (const info of collectCodeStyleFiles(context)) {
            const sourceFile = getCachedSourceFile(context, info);
            walk(sourceFile, (node) => {
                if (!ts.isBinaryExpression(node) ||
                    node.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken)
                    return;
                const replacement = readIsNonEmptyArrayReplacement(node, sourceFile) ??
                    readIsPositiveNumberReplacement(node, sourceFile);
                if (!replacement)
                    return;
                const replaceNode = expandParenthesizedExpression(node);
                const line = lineOf(sourceFile, node);
                section.add({
                    ruleId: 'prefer-semantic-guard-helper',
                    file: info.relativePath,
                    line,
                    message: `${info.relativePath}:${line}: "${snippetOf(sourceFile, node)}" — 请写成 \`${replacement}\`（可 \`arch-guard run --fix\`）。`,
                    fingerprintInput: `${info.relativePath}::${line}::semantic-guard-helper::${replacement}`,
                    fixPhase: CodeStyleFixPhase.preferSemanticGuardHelpers,
                    fixStartOffset: replaceNode.getStart(sourceFile),
                    applyFix: fixReplaceText(info.relativePath, sourceFile, replaceNode, replacement, helpers),
                });
            });
        }
    },
});
function readIsNonEmptyArrayReplacement(node, sourceFile) {
    const guardArg = readGlobalCallArg(node.left, 'isArray');
    if (!guardArg)
        return undefined;
    const arraySubject = readNonEmptyArraySubject(node.right);
    if (!arraySubject || !sameGuardSubject(guardArg, arraySubject, sourceFile))
        return undefined;
    return `isNonEmptyArray(${guardArg.getText(sourceFile)})`;
}
function readIsPositiveNumberReplacement(node, sourceFile) {
    const guardArg = readGlobalCallArg(node.left, 'isNumber');
    if (!guardArg)
        return undefined;
    const numberSubject = readGreaterThanZeroSubject(node.right);
    if (!numberSubject || !sameGuardSubject(guardArg, numberSubject, sourceFile))
        return undefined;
    return `isPositiveNumber(${guardArg.getText(sourceFile)})`;
}
function readGlobalCallArg(expression, functionName) {
    const call = unwrapParens(expression);
    if (!ts.isCallExpression(call))
        return undefined;
    const callee = unwrapParens(call.expression);
    if (!ts.isIdentifier(callee) || callee.text !== functionName)
        return undefined;
    return call.arguments.length === 1 ? call.arguments[0] : undefined;
}
function readNonEmptyArraySubject(expression) {
    const unwrapped = unwrapParens(expression);
    if (ts.isPrefixUnaryExpression(unwrapped) &&
        unwrapped.operator === ts.SyntaxKind.ExclamationToken) {
        const operand = unwrapParens(unwrapped.operand);
        if (ts.isPropertyAccessExpression(operand) && operand.name.text === 'isEmpty')
            return operand.expression;
    }
    return undefined;
}
function readGreaterThanZeroSubject(expression) {
    const unwrapped = unwrapParens(expression);
    if (!ts.isBinaryExpression(unwrapped) ||
        unwrapped.operatorToken.kind !== ts.SyntaxKind.GreaterThanToken)
        return undefined;
    const right = unwrapParens(unwrapped.right);
    if (!ts.isNumericLiteral(right) || right.text !== '0')
        return undefined;
    return unwrapped.left;
}
function sameGuardSubject(guardedExpression, narrowedExpression, sourceFile) {
    return (normalizeOptionalAccessText(guardedExpression.getText(sourceFile)) ===
        normalizeOptionalAccessText(narrowedExpression.getText(sourceFile)));
}
function normalizeOptionalAccessText(text) {
    return text.replaceAll('?.', '.');
}
function unwrapParens(expression) {
    let current = expression;
    while (ts.isParenthesizedExpression(current)) {
        current = current.expression;
    }
    return current;
}
function expandParenthesizedExpression(expression) {
    let current = expression;
    while (ts.isParenthesizedExpression(current.parent)) {
        current = current.parent;
    }
    return current;
}
function fixReplaceText(relativePath, sourceFile, node, replacement, helpers) {
    return fixReplaceSpan({
        relativePath,
        start: node.getStart(sourceFile),
        end: node.getEnd(),
        replacement,
        helpers,
    }).applyFix;
}
export { preferSemanticGuardHelpers };
//# sourceMappingURL=preferSemanticGuardHelpers.js.map