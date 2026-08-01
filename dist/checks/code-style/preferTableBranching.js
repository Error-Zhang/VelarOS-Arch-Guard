import { defineCheck } from '../../core/defineCheck.js';
import ts from 'typescript';
import { collectCodeStyleFiles, getCachedSourceFile, lineOf, walk } from './_shared.js';
const SwitchBranchCount = 3;
const TableBranchCount = 5;
const MinExplicitComparisonCount = 2;
/**
 * 当一段代码用 `if/else if/else if/...` 或一组连续的 `if (x === 'a') return ...; if (x === 'b') return ...;`
 * 表示"同一个 discriminant 的不同分支"时，应该用更合适的形式表达：
 *
 *  - 单个 if + 默认出口：保留 guard/default 写法
 *  - 至少两个显式 if 比较后才提示改写
 *  - 2~4 分支：用 switch
 *  - ≥5 分支：用 table-driven lookup（Map 或对象常量）
 *
 * 合并了旧的两段子规则（else-if 链 + sequential if 链），统一一处实现。
 */
const preferTableBranching = defineCheck({
    id: 'code-style/prefer-table-branching',
    title: 'Prefer table/switch over repeated equality if-branches',
    description: '（建议）同一 discriminant 的多个显式 if 分支：2~4 用 switch、≥5 用 table lookup。单个 guard/default 不提示。',
    verifies: [
        '识别 if-else-if 链全部为 `discriminant === literal` 的形态并报告。',
        '识别同层连续多个 `if (discriminant === literal)` 的形态并报告。',
    ],
    tags: ['code-style', 'readability'],
    defaultSeverity: 'info',
    run({ context, report }) {
        const section = report.section('Branching style');
        const emit = (relativePath, sourceFile, chain) => {
            const line = lineOf(sourceFile, chain.firstNode);
            const guidance = GuidanceByKind[chain.kind];
            section.add({
                ruleId: `${chain.kind}-instead-of-if-chain`,
                file: relativePath,
                line,
                message: `${relativePath}:${line}: "${chain.discriminantText}" maps ${chain.branchCount} outcomes through repeated if branches (${chain.caseTexts.join(', ')}). ${guidance}`,
                fingerprintInput: `${relativePath}::${line}::${chain.discriminantText}::${chain.caseTexts.slice().sort().join(',')}`,
            });
        };
        for (const info of collectCodeStyleFiles(context)) {
            const sourceFile = getCachedSourceFile(context, info);
            walk(sourceFile, (node) => {
                if (ts.isIfStatement(node) && !isElseIfStatement(node)) {
                    const chain = collectElseIfChain(sourceFile, node);
                    if (chain)
                        emit(info.relativePath, sourceFile, chain);
                    return;
                }
                if (ts.isBlock(node) ||
                    ts.isSourceFile(node) ||
                    ts.isCaseClause(node) ||
                    ts.isDefaultClause(node)) {
                    for (const chain of collectSequentialChains(sourceFile, node.statements)) {
                        emit(info.relativePath, sourceFile, chain);
                    }
                }
            });
        }
    },
});
const GuidanceByKind = {
    switch: 'Use switch for repeated explicit outcomes.',
    table: 'Use a table-driven lookup for five or more outcomes.',
};
function isElseIfStatement(node) {
    return ts.isIfStatement(node.parent) && node.parent.elseStatement === node;
}
function unwrap(node) {
    let current = node;
    while (ts.isParenthesizedExpression(current))
        current = current.expression;
    return current;
}
function isLiteralCase(node) {
    const expr = unwrap(node);
    if (ts.isStringLiteralLike(expr) || ts.isNumericLiteral(expr))
        return true;
    return (expr.kind === ts.SyntaxKind.TrueKeyword ||
        expr.kind === ts.SyntaxKind.FalseKeyword ||
        expr.kind === ts.SyntaxKind.NullKeyword);
}
function readEqualityComparison(sourceFile, expression) {
    const expr = unwrap(expression);
    if (!ts.isBinaryExpression(expr))
        return undefined;
    const kind = expr.operatorToken.kind;
    // 只识别 `===`。`==` / `!=` 是有意保留的 null/undefined 合并写法（`x == null` 同时匹配两者），
    // switch 走严格相等没法等价表达；强行让 case 区分这两种 absence 反而是退步——直接放行。
    if (kind !== ts.SyntaxKind.EqualsEqualsEqualsToken)
        return undefined;
    if (isLiteralCase(expr.left) && !isLiteralCase(expr.right))
        return { caseText: expr.left.getText(sourceFile), discriminantText: expr.right.getText(sourceFile) };
    if (isLiteralCase(expr.right) && !isLiteralCase(expr.left))
        return { caseText: expr.right.getText(sourceFile), discriminantText: expr.left.getText(sourceFile) };
    return undefined;
}
function isSimpleExit(statement) {
    if (!statement)
        return false;
    if (ts.isReturnStatement(statement) || ts.isThrowStatement(statement))
        return true;
    if (ts.isBlock(statement) && statement.statements.length === 1)
        return isSimpleExit(statement.statements[0]);
    return false;
}
function classifyChain(branchCount, hasDefault) {
    if (branchCount >= TableBranchCount)
        return 'table';
    if (branchCount >= SwitchBranchCount || !hasDefault)
        return 'switch';
    return undefined;
}
function collectElseIfChain(sourceFile, ifStatement) {
    const comparisons = [];
    let discriminantText;
    let current = ifStatement;
    let hasDefault = false;
    while (current) {
        const comparison = readEqualityComparison(sourceFile, current.expression);
        if (!comparison)
            return undefined;
        if (discriminantText && discriminantText !== comparison.discriminantText)
            return undefined;
        if (!isSimpleExit(current.thenStatement))
            return undefined;
        discriminantText = comparison.discriminantText;
        comparisons.push(comparison);
        const nextStatement = current.elseStatement;
        if (!nextStatement)
            break;
        if (ts.isIfStatement(nextStatement)) {
            current = nextStatement;
            continue;
        }
        if (!isSimpleExit(nextStatement))
            return undefined;
        hasDefault = true;
        break;
    }
    if (comparisons.length < MinExplicitComparisonCount)
        return undefined;
    const branchCount = comparisons.length + (hasDefault ? 1 : 0);
    const kind = classifyChain(branchCount, hasDefault);
    if (!kind || !discriminantText)
        return undefined;
    return {
        branchCount,
        caseTexts: comparisons.map((c) => c.caseText),
        discriminantText,
        kind,
        firstNode: ifStatement,
    };
}
function collectSequentialChains(sourceFile, statements) {
    const chains = [];
    for (let i = 0; i < statements.length; i += 1) {
        // 跳过被前一条同 discriminant 的 if 链涵盖的（去重）
        const prev = statements[i - 1];
        const curr = statements[i];
        if (prev &&
            curr &&
            ts.isIfStatement(prev) &&
            !prev.elseStatement &&
            ts.isIfStatement(curr)) {
            const prevCmp = readEqualityComparison(sourceFile, prev.expression);
            const currCmp = readEqualityComparison(sourceFile, curr.expression);
            if (prevCmp?.discriminantText && prevCmp.discriminantText === currCmp?.discriminantText)
                continue;
        }
        const chain = collectSequentialChainAt(sourceFile, statements, i);
        if (chain)
            chains.push(chain);
    }
    return chains;
}
function collectSequentialChainAt(sourceFile, statements, startIndex) {
    const first = statements[startIndex];
    if (!first || !ts.isIfStatement(first) || first.elseStatement)
        return undefined;
    const firstCmp = readEqualityComparison(sourceFile, first.expression);
    if (!firstCmp || !isSimpleExit(first.thenStatement))
        return undefined;
    const comparisons = [];
    let i = startIndex;
    while (i < statements.length) {
        const stmt = statements[i];
        if (!stmt || !ts.isIfStatement(stmt) || stmt.elseStatement)
            break;
        const cmp = readEqualityComparison(sourceFile, stmt.expression);
        if (!cmp || cmp.discriminantText !== firstCmp.discriminantText)
            break;
        if (!isSimpleExit(stmt.thenStatement))
            break;
        comparisons.push(cmp);
        i += 1;
    }
    let hasDefault = false;
    if (i < statements.length && isSimpleExit(statements[i])) {
        hasDefault = true;
    }
    if (comparisons.length < MinExplicitComparisonCount)
        return undefined;
    const branchCount = comparisons.length + (hasDefault ? 1 : 0);
    const kind = classifyChain(branchCount, hasDefault);
    if (!kind)
        return undefined;
    return {
        branchCount,
        caseTexts: comparisons.map((c) => c.caseText),
        discriminantText: firstCmp.discriminantText,
        kind,
        firstNode: first,
    };
}
export { preferTableBranching };
//# sourceMappingURL=preferTableBranching.js.map