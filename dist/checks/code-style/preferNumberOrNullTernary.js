import { defineCheck } from '../../core/defineCheck.js';
import ts from 'typescript';
import { fixReplaceSpan, readHelperImportSources } from './_fix.js';
import { collectCodeStyleFiles, getCachedSourceFile, lineOf, snippetOf, walk } from './_shared.js';
import { matchNumberOrNullTernary } from './finiteNumberGuardChains.js';
import { CodeStyleFixPhase } from './fixPhases.js';
/**
 * **`isNumber(x) ? x : null`** 或 **`typeof x === 'number' ? x : null`** → **`numberOrNull(x)`**（含 `NaN`；与 `isNumber` 一致）。
 */
const preferNumberOrNullTernary = defineCheck({
    id: 'code-style/prefer-number-or-null-ternary',
    title: 'Prefer numberOrNull over number check identity ternary',
    description: '将 isNumber(x) 或 typeof x === number（含 ==）与同式真分支、null 假分支的三元合并为 numberOrNull(x)。',
    verifies: [
        '顶层三元：number 守卫 + 同式 + : null。',
        'arch-guard run --fix 整段替换。',
    ],
    tags: ['code-style', 'type-guards'],
    defaultSeverity: 'error',
    run({ context, report }) {
        const section = report.section('Prefer numberOrNull ternary');
        const helpers = readHelperImportSources(context);
        for (const info of collectCodeStyleFiles(context)) {
            const sourceFile = getCachedSourceFile(context, info);
            walk(sourceFile, (node) => {
                if (!ts.isConditionalExpression(node))
                    return;
                const subj = matchNumberOrNullTernary(node, sourceFile);
                if (!subj)
                    return;
                const line = lineOf(sourceFile, node);
                const call = `numberOrNull(${formatOperand(subj, sourceFile)})`;
                section.add({
                    ruleId: 'prefer-number-or-null',
                    file: info.relativePath,
                    line,
                    message: `${info.relativePath}:${line}: "${snippetOf(sourceFile, node)}" — 请用 \`${call}\`（可 \`arch-guard run --fix\`）。`,
                    fingerprintInput: `${info.relativePath}::${line}::number-or-null`,
                    fixPhase: CodeStyleFixPhase.preferNumberOrNull,
                    fixStartOffset: node.getStart(sourceFile),
                    applyFix: fixReplaceRange(info.relativePath, sourceFile, node, call, helpers),
                });
            });
        }
    },
});
function fixReplaceRange(relativePath, sourceFile, node, replacement, helpers) {
    return fixReplaceSpan({
        relativePath,
        start: node.getStart(sourceFile),
        end: node.getEnd(),
        replacement,
        helpers,
    }).applyFix;
}
function formatOperand(expression, sourceFile) {
    const text = expression.getText(sourceFile);
    if (ts.isIdentifier(expression) ||
        expression.kind === ts.SyntaxKind.ThisKeyword ||
        expression.kind === ts.SyntaxKind.SuperKeyword ||
        ts.isNonNullExpression(expression) ||
        ts.isPropertyAccessExpression(expression) ||
        ts.isElementAccessExpression(expression) ||
        ts.isMetaProperty(expression))
        return text;
    return `(${text})`;
}
export { preferNumberOrNullTernary };
//# sourceMappingURL=preferNumberOrNullTernary.js.map