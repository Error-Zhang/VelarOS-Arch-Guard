import { defineCheck } from '../../core/defineCheck.js';
import ts from 'typescript';
import { fixReplaceSpan, readHelperImportSources } from './_fix.js';
import { collectCodeStyleFiles, getCachedSourceFile, lineOf, snippetOf, walk } from './_shared.js';
import { CodeStyleFixPhase } from './fixPhases.js';
/**
 * `expr ?? false` 在 **仅以 null/undefined 为缺席哨兵、希望得到 boolean** 时，应写成 `!!expr`（必要时对左侧加括号）。
 *
 * 当左侧已经是 `!!sub` 时，`?? false` 恒多余，修复为删去 `?? false`。
 *
 * 注意：若左侧在非 nullish 时可能是 **非 boolean** 的 falsy（如 `0`、`''`），`?? false` 与 `!!` 语义不同；此类场景不要用本修复 blindly，应收紧类型或改用显式分支。
 */
const preferDoubleBangOverNullishFalse = defineCheck({
    id: 'code-style/prefer-double-bang-over-nullish-false',
    title: 'Prefer `!!` over `?? false` for boolean coercion',
    description: '将 `expr ?? false` 改为 `!!expr`（复杂左操作数自动加括号）；左侧已是 `!!…` 时删去多余的 `?? false`。',
    verifies: [
        '识别 `??` 且右操作数为字面量 `false`。',
        '`!!` 左操作数省略括号（标识符、成员/可选链、调用、`new`、非断言等简单式）。',
        '`arch-guard run --fix` 就地替换源码。',
    ],
    tags: ['code-style', 'coercion', 'nullish'],
    defaultSeverity: 'error',
    run({ context, report }) {
        const section = report.section('Prefer !! over ?? false');
        const helpers = readHelperImportSources(context);
        for (const info of collectCodeStyleFiles(context)) {
            const sourceFile = getCachedSourceFile(context, info);
            walk(sourceFile, (node) => {
                if (!ts.isBinaryExpression(node) || node.operatorToken.kind !== ts.SyntaxKind.QuestionQuestionToken)
                    return;
                if (node.right.kind !== ts.SyntaxKind.FalseKeyword)
                    return;
                const line = lineOf(sourceFile, node);
                const snippet = snippetOf(sourceFile, node);
                const replacement = formatDoubleBangReplacement(node.left, sourceFile);
                section.add({
                    ruleId: 'nullish-false-to-double-bang',
                    file: info.relativePath,
                    line,
                    message: `${info.relativePath}:${line}: "${snippet}" — \`?? false\` 作 boolean 归一时请改为 \`${replacement}\`（可 \`arch-guard run --fix\`）。`,
                    fingerprintInput: `${info.relativePath}::${line}::?? false`,
                    fixPhase: CodeStyleFixPhase.preferDoubleBangOverNullishFalse,
                    fixStartOffset: node.getStart(sourceFile),
                    applyFix: fixReplaceNullishFalse(info.relativePath, sourceFile, node, replacement, helpers),
                });
            });
        }
    },
});
function fixReplaceNullishFalse(relativePath, sourceFile, node, replacement, helpers) {
    return fixReplaceSpan({
        relativePath,
        start: node.getStart(sourceFile),
        end: node.getEnd(),
        replacement,
        helpers,
    }).applyFix;
}
function formatDoubleBangReplacement(left, sourceFile) {
    if (isAlreadyDoubleBooleanCoercion(left))
        return left.getText(sourceFile);
    const inner = left.getText(sourceFile);
    return shouldWrapLeftInParensForDoubleBang(left) ? `!!(${inner})` : `!!${inner}`;
}
function unwrapParens(expr) {
    let e = expr;
    while (ts.isParenthesizedExpression(e)) {
        e = e.expression;
    }
    return e;
}
function isAlreadyDoubleBooleanCoercion(expr) {
    const u = unwrapParens(expr);
    if (!ts.isPrefixUnaryExpression(u) || u.operator !== ts.SyntaxKind.ExclamationToken)
        return false;
    const inner = unwrapParens(u.operand);
    return ts.isPrefixUnaryExpression(inner) && inner.operator === ts.SyntaxKind.ExclamationToken;
}
function shouldWrapLeftInParensForDoubleBang(expr) {
    const u = unwrapParens(expr);
    if (ts.isIdentifier(u) ||
        u.kind === ts.SyntaxKind.ThisKeyword ||
        u.kind === ts.SyntaxKind.SuperKeyword ||
        ts.isPropertyAccessExpression(u) ||
        ts.isElementAccessExpression(u) ||
        ts.isCallExpression(u) ||
        ts.isNewExpression(u) ||
        ts.isNonNullExpression(u) ||
        ts.isMetaProperty(u))
        return false;
    if (u.kind === ts.SyntaxKind.NullKeyword ||
        u.kind === ts.SyntaxKind.TrueKeyword ||
        u.kind === ts.SyntaxKind.FalseKeyword)
        return false;
    if (ts.isLiteralExpression(u))
        return false;
    return true;
}
export { preferDoubleBangOverNullishFalse };
//# sourceMappingURL=preferDoubleBangOverNullishFalse.js.map