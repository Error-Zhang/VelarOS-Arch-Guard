/** 递归收集某目录下指定后缀的所有文件。目录不存在时返回空数组。 */
declare function collectFiles(dir: string, allowedExtensions: ReadonlySet<string>): string[];
/** 寻找项目根目录：向上找含 `package.json` 的目录，未找到时抛错。 */
declare function findProjectRoot(startDir: string): string;
export { collectFiles, findProjectRoot };
//# sourceMappingURL=fs.d.ts.map