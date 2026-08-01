import { defineCheck } from '../../core/defineCheck.js';
import ts from 'typescript';
import { formatBooleanCondition, formatNegatedCondition } from './_booleanExpression.js';
import { fixReplaceSpan, readHelperImportSources } from './_fix.js';
import { collectCodeStyleFiles, getCachedSourceFile, lineOf, snippetOf, unwrapParensExpression, walk, } from './_shared.js';
import { CodeStyleFixPhase } from './fixPhases.js';
/**
 * JSX 的 data-* 属性可以直接接收 boolean，React DOM 会输出 `"true"` / `"false"`。
 *
 * 因此前端代码不需要重复写 `data-x={cond ? 'true' : 'false'}`。
 */
const preferBooleanDataAttributes = defineCheck({
    id: 'code-style/prefer-boolean-data-attributes',
    title: 'Prefer boolean data attributes',
    description: 'JSX data-* 属性直接传 boolean，由 React DOM 输出 true/false 字符串，避免手写字符串布尔三元。',
    verifies: [
        '识别 `data-*={cond ? "true" : "false"}` 与反向写法。',
        '只处理 data-* 属性，不改变 aria-* 或普通字符串枚举。',
        'arch-guard run --fix 自动替换为 boolean 表达式。',
    ],
    tags: ['code-style', 'frontend'],
    defaultSeverity: 'error',
    run({ context, report }) {
        const section = report.section('Prefer boolean data attributes');
        const helpers = readHelperImportSources(context);
        for (const info of collectCodeStyleFiles(context, { frontendOnly: true })) {
            if (!info.relativePath.endsWith('.tsx'))
                continue;
            const sourceFile = getCachedSourceFile(context, info);
            walk(sourceFile, (node) => {
                if (!ts.isJsxAttribute(node))
                    return;
                const plan = readBooleanDataAttributeReplacement(node, sourceFile);
                if (!plan)
                    return;
                const line = lineOf(sourceFile, node);
                section.add({
                    ruleId: 'string-boolean-data-attribute',
                    file: info.relativePath,
                    line,
                    message: `${info.relativePath}:${line}: "${snippetOf(sourceFile, node)}" — ${plan.attributeName} 可直接传 boolean，写成 **${plan.replacement}**（可 \`arch-guard run --fix\`）。`,
                    fingerprintInput: `${info.relativePath}::${line}::${plan.attributeName}`,
                    fixPhase: CodeStyleFixPhase.preferBooleanDataAttribute,
                    fixStartOffset: plan.node.getStart(sourceFile),
                    applyFix: fixReplaceText(info.relativePath, sourceFile, plan.node, plan.replacement, helpers),
                });
            });
        }
    },
});
function readBooleanDataAttributeReplacement(attribute, sourceFile) {
    if (!ts.isIdentifier(attribute.name))
        return undefined;
    const attributeName = attribute.name.text;
    if (!attributeName.startsWith('data-'))
        return undefined;
    if (!attribute.initializer || !ts.isJsxExpression(attribute.initializer))
        return undefined;
    const expression = attribute.initializer.expression;
    if (!expression)
        return undefined;
    const rootExpression = unwrapParensExpression(expression);
    if (ts.isCallExpression(rootExpression))
        return readOptionalWhenDataAttributeReplacement(attributeName, rootExpression, sourceFile);
    if (!ts.isConditionalExpression(rootExpression))
        return undefined;
    const conditional = rootExpression;
    const whenTrue = readBooleanAttributeLiteral(unwrapParensExpression(conditional.whenTrue));
    const whenFalse = readBooleanAttributeLiteral(unwrapParensExpression(conditional.whenFalse));
    if (whenTrue === 'true' && whenFalse === 'false')
        return {
            attributeName,
            node: conditional,
            replacement: formatBooleanCondition(conditional.condition, sourceFile),
        };
    if (whenTrue === 'false' && whenFalse === 'true')
        return {
            attributeName,
            node: conditional,
            replacement: formatNegatedCondition(conditional.condition, sourceFile),
        };
    return undefined;
}
function readOptionalWhenDataAttributeReplacement(attributeName, call, sourceFile) {
    const callee = unwrapParensExpression(call.expression);
    if (!ts.isIdentifier(callee))
        return undefined;
    if (callee.text === 'optionalWhen') {
        if (call.arguments.length !== 2)
            return undefined;
        const condition = call.arguments[0];
        const value = call.arguments[1];
        if (!condition || !value)
            return undefined;
        if (readBooleanAttributeLiteral(unwrapParensExpression(value)) !== 'true')
            return undefined;
        return {
            attributeName,
            node: call,
            replacement: formatBooleanCondition(condition, sourceFile),
        };
    }
    if (callee.text === 'optionalWhenLazy') {
        if (call.arguments.length !== 2)
            return undefined;
        const condition = call.arguments[0];
        const value = call.arguments[1];
        if (!condition || !value)
            return undefined;
        const lazyValue = readLazyBooleanAttributeLiteral(value);
        if (lazyValue !== 'true')
            return undefined;
        return {
            attributeName,
            node: call,
            replacement: formatBooleanCondition(condition, sourceFile),
        };
    }
    return undefined;
}
function readLazyBooleanAttributeLiteral(node) {
    const value = unwrapParensExpression(node);
    if (!ts.isArrowFunction(value) && !ts.isFunctionExpression(value))
        return undefined;
    const body = value.body;
    if (!ts.isExpression(body))
        return undefined;
    return readBooleanAttributeLiteral(unwrapParensExpression(body));
}
function readBooleanAttributeLiteral(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        if (node.text === 'true' || node.text === 'false')
            return node.text;
        return undefined;
    }
    if (node.kind === ts.SyntaxKind.TrueKeyword)
        return 'true';
    if (node.kind === ts.SyntaxKind.FalseKeyword)
        return 'false';
    return undefined;
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
export { preferBooleanDataAttributes };
//# sourceMappingURL=preferBooleanDataAttributes.js.map