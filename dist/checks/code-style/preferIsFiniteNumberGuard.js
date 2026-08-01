import { defineCheck } from '../../core/defineCheck.js';
import ts from 'typescript';
import { fixReplaceSpan, readHelperImportSources } from './_fix.js';
import { collectCodeStyleFiles, getCachedSourceFile, lineOf, snippetOf, walk } from './_shared.js';
import { expressionsTextEqual, matchFiniteNumberPositiveAndPair, matchFiniteNumberRejectOrPair, unwrapParens, } from './finiteNumberGuardChains.js';
import { CodeStyleFixPhase } from './fixPhases.js';
import { flattenAndOperands, flattenOrChainOperands, topOfAndChain, topOfOrChain } from './plainObjectRawAndTriple.js';
/**
 * - **`isNumber(x) && Number.isFinite(x)`**（顺序任意），或 **`typeof x === 'number'`**（/`==`）与 **`Number.isFinite(x)`** → **`isFiniteNumber(x)`**。
 * - **`!isNumber(x) || !Number.isFinite(x)`**，或 **`typeof x !== 'number'`**（/`!=`）与 **`!Number.isFinite(x)`** → **`!isFiniteNumber(x)`**。
 * - 可与 **`prefer-is-plain-object`** 同类：链上其它子式保留；`&&` 上可吸收紧前同参 **truthy** 守卫（`x` / `!!x`）。
 */
const preferIsFiniteNumberGuard = defineCheck({
    id: 'code-style/prefer-is-finite-number-guard',
    title: 'Prefer isFiniteNumber over isNumber + Number.isFinite',
    description: '将 `isNumber(x) && Number.isFinite(x)` 或手写 `typeof` + `Number.isFinite` 合并为 `isFiniteNumber(x)`；将 De Morgan `||` 形式合并为 `!isFiniteNumber(x)`。细则见 `finiteNumberGuardChains.ts`。',
    verifies: [
        '扁平 `&&` 二元窗：`isNumber`/`typeof===number` + `Number.isFinite`。',
        '扁平 `||` 二元窗：`!isNumber`/`typeof!==number` + `!Number.isFinite`。',
        '`arch-guard run --fix` 按运算符拼接前缀/后缀子式。',
    ],
    tags: ['code-style', 'type-guards'],
    defaultSeverity: 'error',
    run({ context, report }) {
        const section = report.section('Prefer isFiniteNumber');
        const helpers = readHelperImportSources(context);
        for (const info of collectCodeStyleFiles(context)) {
            const sourceFile = getCachedSourceFile(context, info);
            walk(sourceFile, (node) => {
                if (!ts.isBinaryExpression(node))
                    return;
                if (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
                    if (topOfAndChain(node) !== node)
                        return;
                    const parts = flattenAndOperands(node);
                    const plan = planFiniteAndReplacement(parts, sourceFile);
                    if (!plan)
                        return;
                    const line = lineOf(sourceFile, node);
                    const replacement = [...plan.prefixTexts, plan.finiteCall, ...plan.suffixTexts].join(' && ');
                    section.add({
                        ruleId: 'prefer-is-finite-number',
                        file: info.relativePath,
                        line,
                        message: `${info.relativePath}:${line}: "${snippetOf(sourceFile, node)}" — 请用 \`${plan.finiteCall}\`（可 \`arch-guard run --fix\`）。`,
                        fingerprintInput: `${info.relativePath}::${line}::is-finite-number`,
                        fixPhase: CodeStyleFixPhase.preferIsFiniteNumber,
                        fixStartOffset: node.getStart(sourceFile),
                        applyFix: fixReplaceRange(info.relativePath, sourceFile, node, replacement, helpers),
                    });
                    return;
                }
                if (node.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
                    if (topOfOrChain(node) !== node)
                        return;
                    const parts = flattenOrChainOperands(node);
                    const orPlan = planFiniteOrReplacement(parts, sourceFile);
                    if (!orPlan)
                        return;
                    const line = lineOf(sourceFile, node);
                    const replacement = [...orPlan.prefixTexts, orPlan.negFiniteCall, ...orPlan.suffixTexts].join(' || ');
                    section.add({
                        ruleId: 'prefer-not-finite-number-or',
                        file: info.relativePath,
                        line,
                        message: `${info.relativePath}:${line}: "${snippetOf(sourceFile, node)}" — 请用 \`${orPlan.negFiniteCall}\`（可 \`arch-guard run --fix\`）。`,
                        fingerprintInput: `${info.relativePath}::${line}::not-finite-number-or`,
                        fixPhase: CodeStyleFixPhase.preferIsFiniteNumber,
                        fixStartOffset: node.getStart(sourceFile),
                        applyFix: fixReplaceRange(info.relativePath, sourceFile, node, replacement, helpers),
                    });
                }
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
function planFiniteAndReplacement(parts, sourceFile) {
    for (let start = 0; start <= parts.length - 2; start += 1) {
        const slice = parts.slice(start, start + 2);
        const subj = matchFiniteNumberPositiveAndPair(slice, sourceFile);
        if (!subj)
            continue;
        let left = start - 1;
        while (left >= 0) {
            const guard = parts[left];
            if (!guard || !isRedundantTruthyGuardOn(guard, subj, sourceFile))
                break;
            left -= 1;
        }
        const inner = formatFiniteOperand(subj, sourceFile);
        const finiteCall = `isFiniteNumber(${inner})`;
        return {
            prefixTexts: parts.slice(0, left + 1).map((p) => p.getText(sourceFile)),
            suffixTexts: parts.slice(start + 2).map((p) => p.getText(sourceFile)),
            finiteCall,
        };
    }
    return undefined;
}
function planFiniteOrReplacement(parts, sourceFile) {
    for (let start = 0; start <= parts.length - 2; start += 1) {
        const slice = parts.slice(start, start + 2);
        const subj = matchFiniteNumberRejectOrPair(slice, sourceFile);
        if (!subj)
            continue;
        const inner = formatFiniteOperand(subj, sourceFile);
        const negFiniteCall = `!isFiniteNumber(${inner})`;
        return {
            prefixTexts: parts.slice(0, start).map((p) => p.getText(sourceFile)),
            suffixTexts: parts.slice(start + 2).map((p) => p.getText(sourceFile)),
            negFiniteCall,
        };
    }
    return undefined;
}
function isRedundantTruthyGuardOn(guard, subject, sourceFile) {
    const u = unwrapParens(guard);
    if (expressionsTextEqual(u, subject, sourceFile))
        return true;
    if (!ts.isPrefixUnaryExpression(u) || u.operator !== ts.SyntaxKind.ExclamationToken)
        return false;
    const inner = unwrapParens(u.operand);
    if (!ts.isPrefixUnaryExpression(inner) || inner.operator !== ts.SyntaxKind.ExclamationToken)
        return false;
    return expressionsTextEqual(unwrapParens(inner.operand), subject, sourceFile);
}
function formatFiniteOperand(expression, sourceFile) {
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
export { preferIsFiniteNumberGuard };
//# sourceMappingURL=preferIsFiniteNumberGuard.js.map