import ts from 'typescript';
/** 根据文件扩展名推断 TS scriptKind。 */
declare function getScriptKindFromFile(filePath: string): ts.ScriptKind;
/** 用 TS API 创建一个 SourceFile（用于 AST 分析）。 */
declare function parseSourceFile(filePath: string, source: string): ts.SourceFile;
/** 解包 as / parenthesized / satisfies 表达式，得到核心 expression。 */
declare function unwrapExpression(expression: ts.Expression): ts.Expression;
/** 取 PropertyName 的字面文本（Identifier / 字符串 / 数字字面量）。 */
declare function getPropertyNameText(name: ts.PropertyName): string | null;
/** 是否为字符串叶子（含模板字面量无替换）。 */
declare function isStringLeafExpression(expression: ts.Expression): boolean;
/** 把 AST 位置转换成 1-based 行号。 */
declare function getLineNumber(sourceFile: ts.SourceFile, position: number): number;
/** 把 AST 位置转换成 1-based 列号。 */
declare function getColumnNumber(sourceFile: ts.SourceFile, position: number): number;
/**
 * 遍历源码中所有注释（不区分单行/块）。
 * 回调收到归一化后的 commentText（去掉 // 和 /* * /），并附带 token 起始位置。
 */
declare function forEachComment(sourceFile: ts.SourceFile, source: string, visitor: (commentText: string, tokenPos: number, rawText: string) => void): void;
declare function normalizeCommentText(rawComment: string): string;
/** 判断源码中是否声明了某个具名 export。 */
declare function hasNamedExport(source: string, exportName: string): boolean;
export { forEachComment, getColumnNumber, getLineNumber, getPropertyNameText, getScriptKindFromFile, hasNamedExport, isStringLeafExpression, normalizeCommentText, parseSourceFile, unwrapExpression, };
//# sourceMappingURL=ts.d.ts.map