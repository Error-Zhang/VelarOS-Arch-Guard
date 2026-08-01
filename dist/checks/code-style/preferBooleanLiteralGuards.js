import { defineCheck } from '../../core/defineCheck.js';
import ts from 'typescript';
import { fixReplaceSpan, readHelperImportSources } from './_fix.js';
import { collectCodeStyleFiles, getCachedSourceFile, lineOf, snippetOf, walk } from './_shared.js';
import { CodeStyleFixPhase } from './fixPhases.js';
const preferBooleanLiteralGuards = defineCheck({
    id: 'code-style/prefer-boolean-literal-guards',
    title: 'Prefer boolean literal guard helpers',
    description: '将 Object.is(x, true/false) 与 readBoolean(...) ===/!== true/false 收敛为 isTrue/isFalse，并去掉 helper 内多余的 readBoolean。',
    verifies: [
        '`Object.is(x, true)` → `isTrue(x)`；`Object.is(x, false)` → `isFalse(x)`。',
        "`readBoolean(record, 'flag') !== true` → `!isTrue(record?.flag)`。",
        "`readBoolean(record, 'flag') === false` → `isFalse(record?.flag)`。",
        "`isFalse(readBoolean(record, 'flag'))` → `isFalse(record?.flag)`。",
        '`arch-guard run --fix` 就地替换源码。',
    ],
    tags: ['code-style', 'type-guards', 'boolean'],
    defaultSeverity: 'error',
    run({ context, report }) {
        const section = report.section('Prefer boolean literal guard helpers');
        const helpers = readHelperImportSources(context);
        for (const info of collectCodeStyleFiles(context)) {
            const sourceFile = getCachedSourceFile(context, info);
            walk(sourceFile, (node) => {
                const replacement = readReplacement(node, sourceFile);
                if (!replacement)
                    return;
                const replaceNode = expandParenthesizedExpression(node);
                const line = lineOf(sourceFile, node);
                section.add({
                    ruleId: 'prefer-boolean-literal-guard',
                    file: info.relativePath,
                    line,
                    message: `${info.relativePath}:${line}: "${snippetOf(sourceFile, node)}" — 请写成 \`${replacement}\`（可 \`arch-guard run --fix\`）。`,
                    fingerprintInput: `${info.relativePath}::${line}::boolean-literal-guard::${replacement}`,
                    fixPhase: CodeStyleFixPhase.preferBooleanLiteralGuards,
                    fixStartOffset: replaceNode.getStart(sourceFile),
                    applyFix: fixReplaceText(info.relativePath, sourceFile, replaceNode, replacement, helpers),
                });
            });
        }
    },
});
function readReplacement(node, sourceFile) {
    if (ts.isCallExpression(node))
        return (readBooleanGuardCallReplacement(node, sourceFile) ??
            readObjectIsBooleanLiteralReplacement(node, sourceFile));
    if (ts.isBinaryExpression(node))
        return readReadBooleanComparisonReplacement(node, sourceFile);
    return undefined;
}
function readObjectIsBooleanLiteralReplacement(call, sourceFile) {
    if (!isObjectIsCall(call) || call.arguments.length !== 2)
        return undefined;
    const leftLiteral = readBooleanLiteral(call.arguments[0]);
    const rightLiteral = readBooleanLiteral(call.arguments[1]);
    if (!leftLiteral && !rightLiteral)
        return undefined;
    if (leftLiteral && rightLiteral)
        return undefined;
    const literal = leftLiteral ?? rightLiteral;
    const expression = leftLiteral ? call.arguments[1] : call.arguments[0];
    if (!literal || !expression)
        return undefined;
    return formatBooleanGuard(expression, literal, sourceFile);
}
function readReadBooleanComparisonReplacement(node, sourceFile) {
    const op = node.operatorToken.kind;
    if (op !== ts.SyntaxKind.EqualsEqualsEqualsToken &&
        op !== ts.SyntaxKind.ExclamationEqualsEqualsToken)
        return undefined;
    const leftLiteral = readBooleanLiteral(node.left);
    const rightLiteral = readBooleanLiteral(node.right);
    if (!leftLiteral && !rightLiteral)
        return undefined;
    if (leftLiteral && rightLiteral)
        return undefined;
    const expression = unwrapParens(leftLiteral ? node.right : node.left);
    if (!ts.isCallExpression(expression) || !isReadBooleanCall(expression))
        return undefined;
    const literal = leftLiteral ?? rightLiteral;
    if (!literal)
        return undefined;
    return formatBooleanGuard(expression, literal, sourceFile, op === ts.SyntaxKind.ExclamationEqualsEqualsToken);
}
function readBooleanGuardCallReplacement(call, sourceFile) {
    const callee = unwrapParens(call.expression);
    if (!ts.isIdentifier(callee) || (callee.text !== 'isTrue' && callee.text !== 'isFalse'))
        return undefined;
    if (call.arguments.length !== 1)
        return undefined;
    const argument = call.arguments[0];
    if (!argument || !ts.isCallExpression(unwrapParens(argument)))
        return undefined;
    const subject = readBooleanSubject(unwrapParens(argument), sourceFile);
    if (!subject)
        return undefined;
    return `${callee.text}(${subject})`;
}
function isObjectIsCall(call) {
    const callee = unwrapParens(call.expression);
    return (ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === 'Object' &&
        callee.name.text === 'is');
}
function isReadBooleanCall(call) {
    const callee = unwrapParens(call.expression);
    return (ts.isIdentifier(callee) &&
        (callee.text === 'readBoolean' || callee.text === 'readBooleanScalar'));
}
function readBooleanSubject(call, sourceFile) {
    if (!isReadBooleanCall(call))
        return undefined;
    if (call.arguments.length === 1)
        return call.arguments[0]?.getText(sourceFile);
    if (call.arguments.length !== 2)
        return undefined;
    const record = call.arguments[0];
    const key = call.arguments[1];
    if (!record || !key || !ts.isStringLiteralLike(key))
        return undefined;
    return formatOptionalPropertyAccess(record, key.text, sourceFile);
}
function readBooleanLiteral(node) {
    if (!node)
        return undefined;
    if (node.kind === ts.SyntaxKind.TrueKeyword)
        return 'true';
    if (node.kind === ts.SyntaxKind.FalseKeyword)
        return 'false';
    return undefined;
}
function formatBooleanGuard(expression, literal, sourceFile, negated = false) {
    const helper = literal === 'true' ? 'isTrue' : 'isFalse';
    const subject = ts.isCallExpression(unwrapParens(expression))
        ? (readBooleanSubject(unwrapParens(expression), sourceFile) ??
            expression.getText(sourceFile))
        : expression.getText(sourceFile);
    const call = `${helper}(${subject})`;
    return negated ? `!${call}` : call;
}
function formatOptionalPropertyAccess(record, key, sourceFile) {
    const receiver = formatOptionalAccessReceiver(record, sourceFile);
    return isIdentifierText(key) ? `${receiver}?.${key}` : `${receiver}?.[${JSON.stringify(key)}]`;
}
function formatOptionalAccessReceiver(record, sourceFile) {
    const unwrapped = unwrapParens(record);
    const text = unwrapped.getText(sourceFile);
    if (isSimpleOptionalAccessReceiver(unwrapped))
        return text;
    return `(${text})`;
}
function isSimpleOptionalAccessReceiver(expression) {
    return (ts.isIdentifier(expression) ||
        expression.kind === ts.SyntaxKind.ThisKeyword ||
        ts.isPropertyAccessExpression(expression) ||
        ts.isElementAccessExpression(expression) ||
        ts.isCallExpression(expression) ||
        ts.isNonNullExpression(expression));
}
function isIdentifierText(text) {
    return /^[A-Za-z_$][\w$]*$/.test(text);
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
export { preferBooleanLiteralGuards };
//# sourceMappingURL=preferBooleanLiteralGuards.js.map