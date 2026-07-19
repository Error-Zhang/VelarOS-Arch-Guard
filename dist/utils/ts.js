import ts from 'typescript';
/** 根据文件扩展名推断 TS scriptKind。 */
function getScriptKindFromFile(filePath) {
    if (filePath.endsWith('.tsx'))
        return ts.ScriptKind.TSX;
    if (filePath.endsWith('.jsx'))
        return ts.ScriptKind.JSX;
    if (filePath.endsWith('.js') || filePath.endsWith('.mjs') || filePath.endsWith('.cjs'))
        return ts.ScriptKind.JS;
    return ts.ScriptKind.TS;
}
/** 用 TS API 创建一个 SourceFile（用于 AST 分析）。 */
function parseSourceFile(filePath, source) {
    return ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, getScriptKindFromFile(filePath));
}
/** 解包 as / parenthesized / satisfies 表达式，得到核心 expression。 */
function unwrapExpression(expression) {
    let current = expression;
    while (ts.isAsExpression(current) ||
        ts.isParenthesizedExpression(current) ||
        ts.isSatisfiesExpression?.(current)) {
        current = current.expression;
    }
    return current;
}
/** 取 PropertyName 的字面文本（Identifier / 字符串 / 数字字面量）。 */
function getPropertyNameText(name) {
    if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name))
        return name.text;
    return null;
}
/** 是否为字符串叶子（含模板字面量无替换）。 */
function isStringLeafExpression(expression) {
    const unwrapped = unwrapExpression(expression);
    return ts.isStringLiteral(unwrapped) || ts.isNoSubstitutionTemplateLiteral(unwrapped);
}
/** 把 AST 位置转换成 1-based 行号。 */
function getLineNumber(sourceFile, position) {
    return sourceFile.getLineAndCharacterOfPosition(position).line + 1;
}
/** 把 AST 位置转换成 1-based 列号。 */
function getColumnNumber(sourceFile, position) {
    return sourceFile.getLineAndCharacterOfPosition(position).character + 1;
}
/**
 * 遍历源码中所有注释（不区分单行/块）。
 * 回调收到归一化后的 commentText（去掉 // 和 /* * /），并附带 token 起始位置。
 */
function forEachComment(sourceFile, source, visitor) {
    const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, sourceFile.languageVariant, source);
    while (scanner.scan() !== ts.SyntaxKind.EndOfFileToken) {
        const token = scanner.getToken();
        if (token !== ts.SyntaxKind.SingleLineCommentTrivia &&
            token !== ts.SyntaxKind.MultiLineCommentTrivia) {
            continue;
        }
        const rawText = scanner.getTokenText();
        const normalized = normalizeCommentText(rawText);
        visitor(normalized, scanner.getTokenPos(), rawText);
    }
}
function normalizeCommentText(rawComment) {
    return rawComment
        .replace(/^\/\//, '')
        .replace(/^\/\*/, '')
        .replace(/\*\/$/, '')
        .split('\n')
        .map((line) => line.replace(/^\s*\*\s?/, '').trim())
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
}
/** 判断源码中是否声明了某个具名 export。 */
function hasNamedExport(source, exportName) {
    const escapedName = exportName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return (new RegExp(`export\\s+(?:function|const|let|var|class|enum|interface|type)\\s+${escapedName}\\b`).test(source) ||
        new RegExp(`export\\s*\\{[^}]*\\b${escapedName}\\b[^}]*\\}`).test(source));
}
export { forEachComment, getColumnNumber, getLineNumber, getPropertyNameText, getScriptKindFromFile, hasNamedExport, isStringLeafExpression, normalizeCommentText, parseSourceFile, unwrapExpression, };
//# sourceMappingURL=ts.js.map