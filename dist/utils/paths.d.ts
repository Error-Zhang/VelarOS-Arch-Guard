/** 路径分隔符归一为正斜杠，便于跨平台 glob 与字符串比较。 */
declare function normalizePathSeparators(filePath: string): string;
/** 把绝对路径转换为以 rootDir 为基准的归一相对路径。 */
declare function toRelativePosix(rootDir: string, filePath: string): string;
/** 判定一个文件是否位于（或就是）某个目录内。 */
declare function isInsideDirectory(filePath: string, directoryPath: string): boolean;
/** 判定一个路径在 windows 风格下是否是绝对路径（含 C:\ 形式）。 */
declare function isAbsoluteLikePath(targetPath: string): boolean;
export { isAbsoluteLikePath, isInsideDirectory, normalizePathSeparators, toRelativePosix };
//# sourceMappingURL=paths.d.ts.map