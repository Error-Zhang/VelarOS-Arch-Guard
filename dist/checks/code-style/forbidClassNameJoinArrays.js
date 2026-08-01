import { defineCheck } from '../../core/defineCheck.js';
import ts from 'typescript';
import { collectCodeStyleFiles, getCachedSourceFile, lineOf, snippetOf, walk } from './_shared.js';
/**
 * 禁止在 JSX 上用 `[...].join(' ')` 拼装 className。
 * Tailwind/utility 类名应置于 CSS Module、共享样式或设计系统封装组件中，而不是在组件里堆字符串片段。
 */
const forbidClassNameJoinArrays = defineCheck({
    id: 'code-style/forbid-classname-join-array',
    title: 'Forbid className built from array.join',
    description: 'className 不得使用若干 string 字面量数组再 `.join(\' \')` 拼接；请改用 CSS Module、样式常量或上层布局组件。',
    verifies: [
        '在 .tsx 中扫描 `className={[`a`,`b`].join(\' \')}` 等形式并报错。',
        '仅匹配 JSX `className` 属性，不误伤普通搜索/日志里的 `.join`。',
    ],
    tags: ['code-style', 'react', 'styling'],
    defaultSeverity: 'error',
    run({ context, report }) {
        const section = report.section('className join array');
        for (const info of collectCodeStyleFiles(context, { frontendOnly: true })) {
            if (!info.relativePath.endsWith('.tsx'))
                continue;
            const sourceFile = getCachedSourceFile(context, info);
            walk(sourceFile, (node) => reportClassNameJoinIfNeeded(section, info.relativePath, sourceFile, node));
        }
    },
});
function reportClassNameJoinIfNeeded(section, relativePath, sourceFile, node) {
    if (!ts.isJsxAttribute(node))
        return;
    if (!ts.isIdentifier(node.name) || node.name.escapedText !== 'className')
        return;
    if (!node.initializer || !ts.isJsxExpression(node.initializer))
        return;
    const expr = node.initializer.expression;
    if (expr === undefined || !isJoinSpaceArray(expr))
        return;
    const line = lineOf(sourceFile, node);
    section.add({
        ruleId: 'classname-join-array',
        file: relativePath,
        line,
        message: `${relativePath}:${line}: 禁止用数组 \`.join(' ')\` 拼接 className（${snippetOf(sourceFile, expr)}）；请用 CSS Module 或统一样式出口。`,
        fingerprintInput: `${relativePath}::${line}::classname-join-array`,
        suggestion: '将样式移到 `*.module.css` / 共享 class 常量，或使用已封装好的布局/表面组件。',
    });
}
function isJoinSpaceArray(expr) {
    if (!ts.isCallExpression(expr))
        return false;
    const callee = expr.expression;
    if (!ts.isPropertyAccessExpression(callee))
        return false;
    if (callee.name.text !== 'join')
        return false;
    if (expr.arguments.length !== 1)
        return false;
    const sep = expr.arguments[0];
    if (sep === undefined)
        return false;
    const sepText = ts.isStringLiteral(sep)
        ? sep.text
        : ts.isNoSubstitutionTemplateLiteral(sep)
            ? sep.text
            : undefined;
    if (sepText !== ' ')
        return false;
    const target = callee.expression;
    if (!ts.isArrayLiteralExpression(target) || target.elements.length < 2)
        return false;
    return true;
}
export { forbidClassNameJoinArrays };
//# sourceMappingURL=forbidClassNameJoinArrays.js.map