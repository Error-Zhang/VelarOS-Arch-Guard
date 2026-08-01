import { defineCheck } from '../../core/defineCheck.js';
import ts from 'typescript';
import { fixReplaceSpan, readHelperImportSources } from './_fix.js';
import { collectCodeStyleFiles, getCachedSourceFile, lineOf, snippetOf, unwrapParensExpression, walk, } from './_shared.js';
import { CodeStyleFixPhase } from './fixPhases.js';
/**
 * 三元/if 把 boolean 再"包装一次"是冗余的。
 *
 *   x ? true : false                 →  !!x
 *   x ? false : true                 →  !x
 *   if (cond) return true; return false  →  return !!cond
 *   if (cond) { return true } else { return false }  →  return !!cond
 *
 * 这条规则只识别非常保守的模式（两边都是 true/false literal），不会误伤业务。
 */
const forbidUselessConditional = defineCheck({
    id: 'code-style/forbid-useless-conditional',
    title: 'Forbid useless boolean-returning conditionals',
    description: '把 boolean 再包装成 true/false 的三元/if 是冗余的；直接返回 boolean 表达式。',
    verifies: [
        '识别 `cond ? true : false` / `cond ? false : true` 三元。',
        '识别 `if (cond) return true; return false` / `if/else { return true } { return false }` 模式。',
    ],
    tags: ['code-style', 'readability'],
    defaultSeverity: 'warning',
    run({ context, report }) {
        const section = report.section('Useless boolean conditional');
        const helpers = readHelperImportSources(context);
        for (const info of collectCodeStyleFiles(context)) {
            const sourceFile = getCachedSourceFile(context, info);
            walk(sourceFile, (node) => {
                if (ts.isConditionalExpression(node)) {
                    const plan = readBooleanLiteralPair(node.whenTrue, node.whenFalse, node.condition, sourceFile);
                    if (!plan)
                        return;
                    const line = lineOf(sourceFile, node);
                    section.add({
                        ruleId: 'ternary-to-boolean',
                        file: info.relativePath,
                        line,
                        message: `${info.relativePath}:${line}: "${snippetOf(sourceFile, node)}" wraps a boolean inside a ternary. Use \`${plan.replacement}\` directly.`,
                        fingerprintInput: `${info.relativePath}::${line}::useless-ternary`,
                        fixPhase: CodeStyleFixPhase.simplifyUselessBooleanConditional,
                        fixStartOffset: node.getStart(sourceFile),
                        applyFix: fixReplaceRange(info.relativePath, sourceFile, node.getStart(sourceFile), node.getEnd(), plan.replacement, helpers),
                    });
                    return;
                }
                if (ts.isIfStatement(node)) {
                    const plan = readIfReturnsBooleanPair(node, sourceFile);
                    if (!plan)
                        return;
                    const line = lineOf(sourceFile, node);
                    section.add({
                        ruleId: 'if-to-boolean',
                        file: info.relativePath,
                        line,
                        message: `${info.relativePath}:${line}: if/else returns boolean literals. Use \`${plan.replacement}\` directly.`,
                        fingerprintInput: `${info.relativePath}::${line}::useless-if-return`,
                        fixPhase: CodeStyleFixPhase.simplifyUselessBooleanConditional,
                        fixStartOffset: plan.start,
                        applyFix: fixReplaceRange(info.relativePath, sourceFile, plan.start, plan.end, plan.replacement, helpers),
                    });
                }
            });
        }
    },
});
function asBooleanLiteralKind(node) {
    if (node.kind === ts.SyntaxKind.TrueKeyword)
        return 'true';
    if (node.kind === ts.SyntaxKind.FalseKeyword)
        return 'false';
    return undefined;
}
function readBooleanLiteralPair(a, b, condition, sourceFile) {
    const left = asBooleanLiteralKind(a);
    const right = asBooleanLiteralKind(b);
    if (!left || !right)
        return undefined;
    if (left === right)
        return undefined;
    return left === 'true'
        ? { replacement: formatBooleanCondition(condition, true, sourceFile) }
        : { replacement: formatBooleanCondition(condition, false, sourceFile) };
}
function singleReturnExpression(stmt) {
    if (ts.isReturnStatement(stmt))
        return stmt.expression;
    if (ts.isBlock(stmt) && stmt.statements.length === 1) {
        const inner = stmt.statements[0];
        if (!inner)
            return undefined;
        return singleReturnExpression(inner);
    }
    return undefined;
}
function readIfReturnsBooleanPair(node, sourceFile) {
    const thenExpression = singleReturnExpression(node.thenStatement);
    if (!thenExpression)
        return undefined;
    const thenKind = asBooleanLiteralKind(thenExpression);
    if (!thenKind)
        return undefined;
    let elseExpression;
    let endNode;
    if (node.elseStatement) {
        elseExpression = singleReturnExpression(node.elseStatement);
        endNode = node;
    }
    else {
        const parentBlock = node.parent;
        if (!parentBlock ||
            (!ts.isBlock(parentBlock) && !ts.isSourceFile(parentBlock)))
            return undefined;
        const statements = parentBlock.statements;
        const idx = statements.indexOf(node);
        if (idx === -1)
            return undefined;
        // 守卫链豁免：如果这个 `if` 前后还有另一个返回 boolean literal 的 `if`，
        // 那这是 `guard return` 模式，整体可读性优于折叠为 `return !cond`，不报告。
        if (isPartOfBooleanGuardChain(statements, idx))
            return undefined;
        const next = statements[idx + 1];
        if (!next)
            return undefined;
        elseExpression = singleReturnExpression(next);
        endNode = next;
    }
    if (!elseExpression)
        return undefined;
    const elseKind = asBooleanLiteralKind(elseExpression);
    if (!elseKind || elseKind === thenKind)
        return undefined;
    return {
        replacement: `return ${formatBooleanCondition(node.expression, thenKind === 'true', sourceFile)}`,
        start: node.getStart(sourceFile),
        end: endNode.getEnd(),
    };
}
function formatBooleanCondition(condition, positivePolarity, sourceFile) {
    const unwrapped = unwrapParensExpression(condition);
    if (!positivePolarity)
        return formatNegatedExpression(unwrapped, sourceFile);
    if (isAlreadyBooleanExpression(unwrapped))
        return unwrapped.getText(sourceFile);
    return `!!${formatUnaryOperand(unwrapped, sourceFile)}`;
}
function formatNegatedExpression(expression, sourceFile) {
    const isAlreadyNegated = ts.isPrefixUnaryExpression(expression) && expression.operator === ts.SyntaxKind.ExclamationToken;
    if (isAlreadyNegated) {
        const operand = unwrapParensExpression(expression.operand);
        return formatBooleanCondition(operand, true, sourceFile);
    }
    return `!${formatUnaryOperand(expression, sourceFile)}`;
}
function formatUnaryOperand(expression, sourceFile) {
    const text = expression.getText(sourceFile);
    if (isUnarySafeExpression(expression))
        return text;
    return `(${text})`;
}
function isAlreadyBooleanExpression(expression) {
    if (expression.kind === ts.SyntaxKind.TrueKeyword ||
        expression.kind === ts.SyntaxKind.FalseKeyword)
        return true;
    const isNegated = ts.isPrefixUnaryExpression(expression) && expression.operator === ts.SyntaxKind.ExclamationToken;
    if (isNegated)
        return true;
    if (!ts.isBinaryExpression(expression))
        return false;
    if (expression.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
        expression.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
        expression.operatorToken.kind === ts.SyntaxKind.EqualsEqualsToken ||
        expression.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsToken ||
        expression.operatorToken.kind === ts.SyntaxKind.LessThanToken ||
        expression.operatorToken.kind === ts.SyntaxKind.LessThanEqualsToken ||
        expression.operatorToken.kind === ts.SyntaxKind.GreaterThanToken ||
        expression.operatorToken.kind === ts.SyntaxKind.GreaterThanEqualsToken ||
        expression.operatorToken.kind === ts.SyntaxKind.InKeyword ||
        expression.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword)
        return true;
    return false;
}
function isUnarySafeExpression(expression) {
    return (ts.isIdentifier(expression) ||
        ts.isCallExpression(expression) ||
        ts.isPropertyAccessExpression(expression) ||
        ts.isElementAccessExpression(expression) ||
        ts.isNonNullExpression(expression) ||
        expression.kind === ts.SyntaxKind.ThisKeyword ||
        expression.kind === ts.SyntaxKind.SuperKeyword ||
        expression.kind === ts.SyntaxKind.TrueKeyword ||
        expression.kind === ts.SyntaxKind.FalseKeyword ||
        expression.kind === ts.SyntaxKind.NullKeyword);
}
function fixReplaceRange(relativePath, sourceFile, start, end, replacement, helpers) {
    return fixReplaceSpan({ relativePath, start, end, replacement, helpers }).applyFix;
}
/**
 * 判断 statements[index] 是否处于一段 boolean guard 链中。
 *
 * 形如：
 *   if (a) return false
 *   if (b) return false
 *   if (c) return false   // ← 处于链中
 *   return true
 * 这种"多步守卫 + 末尾兜底"的写法可读性比 `return !a && !b && !c` 高很多，不强求折叠。
 */
function isPartOfBooleanGuardChain(statements, index) {
    const sibling = (offset) => statements[index + offset];
    const isBooleanIf = (stmt) => {
        if (!stmt || !ts.isIfStatement(stmt))
            return false;
        const expression = singleReturnExpression(stmt.thenStatement);
        return !!expression && asBooleanLiteralKind(expression) !== undefined;
    };
    return isBooleanIf(sibling(-1)) || isBooleanIf(sibling(1));
}
export { forbidUselessConditional };
//# sourceMappingURL=forbidUselessConditional.js.map