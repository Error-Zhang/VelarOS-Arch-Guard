import type { CheckRunContext } from '../core/defineCheck.js';
/**
 * 内部规则统一的源文件收集器。
 *
 * 规则可以声明 `options.sources` 来指定关心的文件后缀，缺省覆盖 TS/JS 全套。
 * 同时支持 include/exclude glob，由共享 FileCollections 完成。
 */
declare function collectSourceFilesForCheck(context: CheckRunContext, options: {
    roots?: readonly string[];
    extensions?: readonly string[];
    include?: readonly string[];
    exclude?: readonly string[];
}): string[];
/** 读取文件名扩展名（小写、含点）。 */
declare function fileExt(filePath: string): string;
/** 把绝对路径转换为以 rootDir 为基准的相对路径，常用于消息输出。 */
declare function rel(context: CheckRunContext, filePath: string): string;
/** 读取规则 option：默认值兜底 + 简单类型守卫。 */
declare function readOption<T>(context: CheckRunContext, key: string, defaultValue: T, isValid: (value: unknown) => value is T): T;
declare function isStringArray(value: unknown): value is readonly string[];
declare function isStringRecord(value: unknown): value is Readonly<Record<string, string>>;
export { collectSourceFilesForCheck, fileExt, isStringArray, isStringRecord, readOption, rel };
//# sourceMappingURL=_helpers.d.ts.map