/** 把任意字符转义后嵌入 RegExp 字面量。 */
declare function escapeRegExp(value: string): string;
/** 格式化一份"前 N 个 + 省略提示"的列表展示，便于 stylish reporter 输出。 */
declare function formatShortList(items: readonly string[], limit?: number): string;
/** kebab-case 转 PascalCase。 */
declare function kebabToPascalCase(value: string): string;
/** 短 hash，常用于 fingerprint 提取关键内容指纹。 */
declare function shortHash(value: string, length?: number): string;
/** 去掉源码中所有行注释 (`// ...`) 和块注释 (`/* ... *\/`)，保留代码结构。 */
declare function stripCodeComments(source: string): string;
/**
 * 按 1-based 行号删除一整行（用于机械删行类 autofix）。
 * 尽量保留末尾换行；换行风格统一为 `\n`（与多数格式化工具一致）。
 */
declare function deleteLineAt(source: string, lineOneBased: number): string;
export { deleteLineAt, escapeRegExp, formatShortList, kebabToPascalCase, shortHash, stripCodeComments, };
//# sourceMappingURL=text.d.ts.map