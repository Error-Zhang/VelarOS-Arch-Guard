import { defineCheck } from '../../core/defineCheck.js';
import ts from 'typescript';
import { fixReplaceSpan, readHelperImportSources } from './_fix.js';
import { collectCodeStyleFiles, getCachedSourceFile, lineOf, snippetOf, walk } from './_shared.js';
import { CodeStyleFixPhase } from './fixPhases.js';
const ArrayFactoryMethodNames = new Set(['filter', 'flatMap', 'map', 'slice', 'sort', 'split']);
const StringFactoryMethodNames = new Set(['replace', 'slice', 'substring', 'toLowerCase', 'toUpperCase', 'trim']);
const ArrayReturningNamePattern = /(?:Artifacts|Branches|Candidates|Categories|Changes|Commands|Entries|Features|Files|Hints|Ids|IDs|Items|Keys|Labels|Lines|List|Lists|Manifests|Messages|Models|Nodes|Notes|Outputs|Paths|Ports|Results|Roles|Roots|Rows|Sessions|Snippets|Steps|Symbols|Tasks|Tools|Values|Windows)$/;
/**
 * 业务代码用具名导出 `isEmpty(x)` / `isBlank(x)`（`@velaros-ai/core`）表达空检查，避免 `.length === 0`
 * / `=== ''` / `.trim().length === 0` 之类样板。
 *
 * 这是原型扩展 `.isEmpty` / `.isBlank` 去全局化后的接替检查：能力从 `String`/`Array` 原型迁到具名函数，
 * 「土办法」（裸 length / 空串比较）仍要挡住，锁死 house dialect。
 *
 * 仅作用于运行时业务代码（_shared 已默认排除便携包 / logger / typeGuards）。
 * 启发式判定 array-like / string-like：变量名后缀（Items、Names...）、变量声明类型、形参类型，
 * 以及 .filter/.map/.split/...trim() 等"已知 string-producing"调用。
 */
const preferEmptinessHelpers = defineCheck({
    id: 'code-style/prefer-emptiness-helpers',
    title: 'Prefer emptiness helpers (isEmpty / isBlank)',
    description: '业务代码用 `isEmpty(x)` / `isBlank(x)` 表达空检查，避免 `.length === 0` / `""` 比较等样板。',
    verifies: [
        '识别 `xs.length === 0` / `> 0` / `!xs.length` 等；空 → **`isEmpty(xs)`**，非空 → **`!isEmpty(xs)`**。',
        '无 **可选链** 的此类比较可 **`arch-guard run --fix`**；可选链场景保持手写，避免为提示引入更啰嗦的 undefined 语义表达。',
        '识别 `s === ""` / `s.trim() === ""` 等检查并提示用 **`isEmpty(s)`** / **`isBlank(s)`**。',
        '**`isEmpty`** / **`isBlank`** 为 `@velaros-ai/core` 具名导出；调用点需显式 import。',
    ],
    tags: ['code-style', 'emptiness'],
    defaultSeverity: 'error',
    run({ context, report }) {
        const section = report.section('Emptiness helper usage');
        const helpers = readHelperImportSources(context);
        for (const info of collectCodeStyleFiles(context)) {
            const sourceFile = getCachedSourceFile(context, info);
            const hints = collectRuntimeHints(sourceFile);
            walk(sourceFile, (node) => {
                const violation = detectViolation(node, sourceFile, hints);
                if (!violation)
                    return;
                const line = lineOf(sourceFile, node);
                section.add({
                    ruleId: violation.ruleId,
                    file: info.relativePath,
                    line,
                    message: `${info.relativePath}:${line}: "${snippetOf(sourceFile, node)}" ${violation.text}`,
                    fingerprintInput: `${info.relativePath}::${line}::${violation.ruleId}`,
                    ...(violation.fix
                        ? {
                            fixPhase: CodeStyleFixPhase.preferEmptinessHelpers,
                            fixStartOffset: violation.fix.replaceNode.getStart(sourceFile),
                            applyFix: fixReplaceLengthCheck(info.relativePath, sourceFile, violation.fix.replaceNode, violation.fix.replacement, helpers),
                        }
                        : {}),
                });
            });
        }
    },
});
function detectViolation(node, sourceFile, hints) {
    const emptyStringOperand = readEmptyStringComparison(node);
    if (emptyStringOperand) {
        const helper = isTrimCall(emptyStringOperand) ? 'isBlank' : 'isEmpty';
        return {
            ruleId: `empty-string-${helper}`,
            text: `compares with an empty string. Use ${helper}(value) instead.`,
        };
    }
    const pattern = readLengthIsEmptyPattern(node);
    if (!pattern)
        return undefined;
    if (pattern.lengthAccess.getText(sourceFile).includes('?.'))
        return undefined;
    const helper = helperFor(pattern.lengthAccess.expression, hints);
    if (!helper)
        return undefined;
    const wantsNonEmpty = pattern.preferNonEmpty;
    const baseText = pattern.lengthAccess.expression.getText(sourceFile);
    const example = wantsNonEmpty ? `!${helper}(base)` : `${helper}(base)`;
    const replacement = wantsNonEmpty ? `!${helper}(${baseText})` : `${helper}(${baseText})`;
    return {
        ruleId: 'length-empty-check',
        text: `checks emptiness through .length. Prefer **\`${example}\`** (${helper} is a @velaros-ai/core named export; replace base with the real receiver).`,
        fix: { replaceNode: pattern.replaceNode, replacement },
    };
}
function readEmptyStringComparison(node) {
    if (!ts.isBinaryExpression(node))
        return undefined;
    if (!isEqualityOperator(node.operatorToken.kind))
        return undefined;
    if (isEmptyStringLiteral(node.left))
        return node.right;
    if (isEmptyStringLiteral(node.right))
        return node.left;
    return undefined;
}
function isEqualityOperator(kind) {
    return (kind === ts.SyntaxKind.EqualsEqualsToken ||
        kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
        kind === ts.SyntaxKind.ExclamationEqualsToken ||
        kind === ts.SyntaxKind.ExclamationEqualsEqualsToken);
}
function isLengthOperator(kind) {
    return (isEqualityOperator(kind) ||
        kind === ts.SyntaxKind.GreaterThanToken ||
        kind === ts.SyntaxKind.GreaterThanEqualsToken ||
        kind === ts.SyntaxKind.LessThanToken ||
        kind === ts.SyntaxKind.LessThanEqualsToken);
}
function isEmptyStringLiteral(node) {
    return ts.isStringLiteral(node) && node.text === '';
}
function isZeroLiteral(node) {
    return ts.isNumericLiteral(node) && Number(node.text) === 0;
}
function isOneLiteral(node) {
    return ts.isNumericLiteral(node) && Number(node.text) === 1;
}
function readLengthIsEmptyPattern(node) {
    if (ts.isBinaryExpression(node) && isLengthOperator(node.operatorToken.kind)) {
        const L = node.left;
        const R = node.right;
        const op = node.operatorToken.kind;
        const lenL = isLengthAccess(L);
        const lenR = isLengthAccess(R);
        const zL = isZeroLiteral(L);
        const zR = isZeroLiteral(R);
        const oL = isOneLiteral(L);
        const oR = isOneLiteral(R);
        if (lenL && zR) {
            if (op === ts.SyntaxKind.EqualsEqualsToken || op === ts.SyntaxKind.EqualsEqualsEqualsToken)
                return { lengthAccess: L, replaceNode: node, preferNonEmpty: false };
            if (op === ts.SyntaxKind.ExclamationEqualsToken || op === ts.SyntaxKind.ExclamationEqualsEqualsToken)
                return { lengthAccess: L, replaceNode: node, preferNonEmpty: true };
            if (op === ts.SyntaxKind.GreaterThanToken)
                return { lengthAccess: L, replaceNode: node, preferNonEmpty: true };
            if (op === ts.SyntaxKind.LessThanEqualsToken)
                return { lengthAccess: L, replaceNode: node, preferNonEmpty: false };
            return undefined;
        }
        if (lenL && oR) {
            if (op === ts.SyntaxKind.GreaterThanEqualsToken)
                return { lengthAccess: L, replaceNode: node, preferNonEmpty: true };
            if (op === ts.SyntaxKind.LessThanToken)
                return { lengthAccess: L, replaceNode: node, preferNonEmpty: false };
            return undefined;
        }
        if (zL && lenR) {
            if (op === ts.SyntaxKind.EqualsEqualsToken || op === ts.SyntaxKind.EqualsEqualsEqualsToken)
                return { lengthAccess: R, replaceNode: node, preferNonEmpty: false };
            if (op === ts.SyntaxKind.ExclamationEqualsToken || op === ts.SyntaxKind.ExclamationEqualsEqualsToken)
                return { lengthAccess: R, replaceNode: node, preferNonEmpty: true };
            if (op === ts.SyntaxKind.LessThanToken)
                return { lengthAccess: R, replaceNode: node, preferNonEmpty: true };
            if (op === ts.SyntaxKind.GreaterThanEqualsToken)
                return { lengthAccess: R, replaceNode: node, preferNonEmpty: false };
            return undefined;
        }
        if (oL && lenR && op === ts.SyntaxKind.LessThanEqualsToken)
            return { lengthAccess: R, replaceNode: node, preferNonEmpty: true };
        return undefined;
    }
    if (ts.isPrefixUnaryExpression(node) &&
        node.operator === ts.SyntaxKind.ExclamationToken &&
        isLengthAccess(node.operand))
        return { lengthAccess: node.operand, replaceNode: node, preferNonEmpty: false };
    if (isLengthAccess(node) && isBooleanContextNode(node))
        return { lengthAccess: node, replaceNode: node, preferNonEmpty: true };
    return undefined;
}
function isLengthAccess(node) {
    return ts.isPropertyAccessExpression(node) && node.name.text === 'length';
}
function isTrimCall(node) {
    return (ts.isCallExpression(node) &&
        node.arguments.length === 0 &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'trim');
}
function isBooleanContextNode(node) {
    let expression = node;
    let parent = expression.parent;
    while (parent && ts.isBinaryExpression(parent) && isLogicalOperator(parent.operatorToken.kind)) {
        expression = parent;
        parent = parent.parent;
    }
    if (!parent)
        return false;
    if ((ts.isIfStatement(parent) || ts.isWhileStatement(parent) || ts.isDoStatement(parent)) &&
        parent.expression === expression)
        return true;
    if (ts.isConditionalExpression(parent) && parent.condition === expression)
        return true;
    if (ts.isForStatement(parent) && parent.condition === expression)
        return true;
    if (ts.isCallExpression(parent) &&
        ts.isIdentifier(parent.expression) &&
        parent.expression.text === 'Boolean' &&
        parent.arguments[0] === expression)
        return true;
    return false;
}
function isLogicalOperator(kind) {
    return kind === ts.SyntaxKind.BarBarToken || kind === ts.SyntaxKind.AmpersandAmpersandToken;
}
function helperFor(expression, hints) {
    if (isTrimCall(expression))
        return 'isBlank';
    if (ts.isIdentifier(expression)) {
        if (hints.stringLikeNames.has(expression.text))
            return 'isEmpty';
        if (hints.arrayLikeNames.has(expression.text))
            return 'isEmpty';
    }
    if (looksLikeArrayFactory(expression, hints))
        return 'isEmpty';
    if (looksLikeStringFactory(expression))
        return 'isEmpty';
    if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression))
        return 'isEmpty';
    return undefined;
}
function looksLikeArrayFactory(expression, hints) {
    if (ts.isArrayLiteralExpression(expression))
        return true;
    if (!ts.isCallExpression(expression))
        return false;
    const callee = expression.expression;
    if (ts.isIdentifier(callee))
        return hints.arrayReturningFunctionNames.has(callee.text);
    if (!ts.isPropertyAccessExpression(callee))
        return false;
    if (ArrayFactoryMethodNames.has(callee.name.text))
        return true;
    if (ts.isIdentifier(callee.expression)) {
        if (callee.expression.text === 'Array' && callee.name.text === 'from')
            return true;
        if (callee.expression.text === 'Object' && ['entries', 'keys', 'values'].includes(callee.name.text))
            return true;
    }
    const name = readCalleeName(callee);
    return Boolean(name && ArrayReturningNamePattern.test(name));
}
function looksLikeStringFactory(expression) {
    if (ts.isStringLiteralLike(expression))
        return true;
    if (!ts.isCallExpression(expression))
        return false;
    if (!ts.isPropertyAccessExpression(expression.expression))
        return false;
    return StringFactoryMethodNames.has(expression.expression.name.text);
}
function readCalleeName(callee) {
    if (ts.isIdentifier(callee))
        return callee.text;
    if (ts.isPropertyAccessExpression(callee))
        return callee.name.text;
    return undefined;
}
function isArrayTypeNode(node) {
    if (!node)
        return false;
    if (ts.isArrayTypeNode(node))
        return true;
    if (!ts.isTypeReferenceNode(node))
        return false;
    const name = node.typeName.getText();
    return name === 'Array' || name === 'ReadonlyArray';
}
function isStringTypeNode(node) {
    return node?.kind === ts.SyntaxKind.StringKeyword;
}
function collectRuntimeHints(sourceFile) {
    const hints = {
        arrayLikeNames: new Set(),
        stringLikeNames: new Set(),
        arrayReturningFunctionNames: new Set(),
    };
    const collectFunctions = (node) => {
        if (ts.isFunctionDeclaration(node) && node.name && isArrayTypeNode(node.type)) {
            hints.arrayReturningFunctionNames.add(node.name.text);
        }
        ts.forEachChild(node, collectFunctions);
    };
    collectFunctions(sourceFile);
    const collectNames = (node) => {
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
            const init = node.initializer;
            if (isArrayTypeNode(node.type) || (init && looksLikeArrayFactory(init, hints))) {
                hints.arrayLikeNames.add(node.name.text);
            }
            if (isStringTypeNode(node.type) || (init && looksLikeStringFactory(init))) {
                hints.stringLikeNames.add(node.name.text);
            }
        }
        if (ts.isParameter(node) && ts.isIdentifier(node.name)) {
            if (isArrayTypeNode(node.type))
                hints.arrayLikeNames.add(node.name.text);
            if (isStringTypeNode(node.type))
                hints.stringLikeNames.add(node.name.text);
        }
        ts.forEachChild(node, collectNames);
    };
    collectNames(sourceFile);
    return hints;
}
function fixReplaceLengthCheck(relativePath, sourceFile, node, replacement, helpers) {
    return fixReplaceSpan({
        relativePath,
        start: node.getStart(sourceFile),
        end: node.getEnd(),
        replacement,
        helpers,
    }).applyFix;
}
export { preferEmptinessHelpers };
//# sourceMappingURL=preferEmptinessHelpers.js.map