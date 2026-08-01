import { defineCheck } from '../../core/defineCheck.js';
import ts from 'typescript';
import { collectCodeStyleFiles, getCachedSourceFile, lineOf, snippetOf, walk } from './_shared.js';
import { readTypeofObjectStrictNotNullMerge } from './forbidRawRuntimeTypeGuards.js';
/**
 * 标记与 `undefined` / **`null`** / `true` / `false` 的 `===` / `!==`，以及 **`typeof expr ===/!== 'undefined'`**（字符串字面量）。
 *
 * 优先改为 **`isNull` / `isNotNull` / `isPresent`**、**`Object.is(x, undefined)`**、**`globalThis.*` 可选链**、`??`、`!!` 等简写。
 *
 * **`typeof x === 'object' && x !== null` 整段**：不由本规则对中间的 `!== null` 单独报 `compare-null`（否则会误导成只改成 `isNotNull`）；请见 **`code-style/forbid-raw-runtime-type-guards`**，**优先合并为 `isObject(x)`**。
 *
 * 仍需旧式写法时在命中行上方使用 `@arch-guard:suspend code-style/forbid-redundant-strict-literal-comparison 理由：…`。
 */
const forbidRedundantStrictLiteralComparison = defineCheck({
    id: 'code-style/forbid-redundant-strict-literal-comparison',
    title: 'Flag strict equality against undefined / null / boolean literals',
    description: '标记 ===/!== 与 undefined、null、true、false 字面量，以及 typeof x 与字符串 "undefined" 的比较（含左右互换）。',
    verifies: [
        '识别 `expr === undefined` / `expr !== undefined`（含 `void 0` 一侧）。',
        '识别 `expr === null` / `expr !== null`。',
        '识别 `typeof expr === \'undefined\'` / `!==`（含左右侧互换）。',
        '识别 `expr === true` / `expr === false` 及其否定运算。',
        '当两侧均为上述字面量比较时跳过（如 `true === true`）。',
    ],
    tags: ['code-style', 'readability'],
    defaultSeverity: 'error',
    run({ context, report }) {
        const section = report.section('Strict literal comparison');
        for (const info of collectCodeStyleFiles(context)) {
            const sourceFile = getCachedSourceFile(context, info);
            walk(sourceFile, (node) => {
                if (!ts.isBinaryExpression(node))
                    return;
                const op = node.operatorToken.kind;
                if (op !== ts.SyntaxKind.EqualsEqualsEqualsToken && op !== ts.SyntaxKind.ExclamationEqualsEqualsToken)
                    return;
                const opText = op === ts.SyntaxKind.EqualsEqualsEqualsToken ? '===' : '!==';
                const typeofUndef = readTypeofComparedToUndefinedStringLiteral(node);
                if (typeofUndef) {
                    const line = lineOf(sourceFile, node);
                    section.add({
                        ruleId: 'typeof-undefined-string-literal',
                        file: info.relativePath,
                        line,
                        message: `${info.relativePath}:${line}: "${snippetOf(sourceFile, node)}" compares typeof to string \`'undefined'\`. Prefer \`isPresent(...)\` / \`Object.is(..., undefined)\` / \`globalThis.*\` optional chaining / \`??\` when equivalent; otherwise \`@arch-guard:suspend code-style/forbid-redundant-strict-literal-comparison 理由：…\`.`,
                        fingerprintInput: `${info.relativePath}::${line}::typeof-undef-str::${opText}`,
                    });
                    return;
                }
                const leftLit = readStrictLiteralComparable(node.left);
                const rightLit = readStrictLiteralComparable(node.right);
                if (leftLit && rightLit)
                    return;
                const lit = leftLit ?? rightLit;
                if (!lit)
                    return;
                if (lit === 'null' &&
                    op === ts.SyntaxKind.ExclamationEqualsEqualsToken &&
                    isNullNeInTypeofObjectMerge(sourceFile, node))
                    return;
                const line = lineOf(sourceFile, node);
                const ruleId = lit === 'undefined'
                    ? 'compare-undefined'
                    : lit === 'null'
                        ? 'compare-null'
                        : lit === 'true'
                            ? 'compare-true'
                            : 'compare-false';
                const message = lit === 'null'
                    ? `${info.relativePath}:${line}: "${snippetOf(sourceFile, node)}" uses ${opText} against \`null\`. Prefer \`isNull(...)\` / \`isNotNull(...)\` (or \`isPresent(...)\` when excluding both null and undefined); otherwise add \`@arch-guard:suspend code-style/forbid-redundant-strict-literal-comparison 理由：…\` above.`
                    : `${info.relativePath}:${line}: "${snippetOf(sourceFile, node)}" uses ${opText} against \`${lit}\`. Prefer a simpler equivalent when semantics match; if narrowing requires this form, add \`@arch-guard:suspend code-style/forbid-redundant-strict-literal-comparison 理由：…\` above.`;
                section.add({
                    ruleId,
                    file: info.relativePath,
                    line,
                    message,
                    fingerprintInput: `${info.relativePath}::${line}::${ruleId}::${opText}`,
                });
            });
        }
    },
});
function isNullNeInTypeofObjectMerge(sourceFile, node) {
    const parent = node.parent;
    if (!ts.isBinaryExpression(parent) || parent.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken)
        return false;
    return readTypeofObjectStrictNotNullMerge(parent, sourceFile) !== undefined;
}
function readStrictLiteralComparable(node) {
    if (node.kind === ts.SyntaxKind.TrueKeyword)
        return 'true';
    if (node.kind === ts.SyntaxKind.FalseKeyword)
        return 'false';
    if (node.kind === ts.SyntaxKind.NullKeyword)
        return 'null';
    if (node.kind === ts.SyntaxKind.UndefinedKeyword)
        return 'undefined';
    if (ts.isIdentifier(node) && node.text === 'undefined')
        return 'undefined';
    if (ts.isVoidExpression(node))
        return 'undefined';
    return undefined;
}
/** `typeof expr === 'undefined'` / `'undefined' === typeof expr`（及 `!==`） */
function readTypeofComparedToUndefinedStringLiteral(node) {
    if (ts.isTypeOfExpression(node.left) && ts.isStringLiteral(node.right) && node.right.text === 'undefined')
        return true;
    if (ts.isTypeOfExpression(node.right) && ts.isStringLiteral(node.left) && node.left.text === 'undefined')
        return true;
    return false;
}
export { forbidRedundantStrictLiteralComparison };
//# sourceMappingURL=forbidRedundantStrictLiteralComparison.js.map