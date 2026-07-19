import { isAbsolute, relative, sep } from 'node:path';
/** 路径分隔符归一为正斜杠，便于跨平台 glob 与字符串比较。 */
function normalizePathSeparators(filePath) {
    return filePath.split(sep).join('/');
}
/** 把绝对路径转换为以 rootDir 为基准的归一相对路径。 */
function toRelativePosix(rootDir, filePath) {
    const rel = relative(rootDir, filePath);
    return normalizePathSeparators(rel);
}
/** 判定一个文件是否位于（或就是）某个目录内。 */
function isInsideDirectory(filePath, directoryPath) {
    const normalizedFile = normalizePathSeparators(filePath);
    const normalizedDirectory = normalizePathSeparators(directoryPath);
    return (normalizedFile === normalizedDirectory ||
        normalizedFile.startsWith(`${normalizedDirectory}/`));
}
/** 判定一个路径在 windows 风格下是否是绝对路径（含 C:\ 形式）。 */
function isAbsoluteLikePath(targetPath) {
    return isAbsolute(targetPath) || /^[a-zA-Z]:[\\/]/.test(targetPath);
}
export { isAbsoluteLikePath, isInsideDirectory, normalizePathSeparators, toRelativePosix };
//# sourceMappingURL=paths.js.map