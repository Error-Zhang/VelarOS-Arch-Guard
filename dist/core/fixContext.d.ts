import type { ArchGuardLogger } from './logger.js';
/**
 * 提供给 `ViolationInput.applyFix` 的最小 IO 面：统一走仓库根相对路径，写盘原子化。
 */
interface FixContext {
    readonly rootDir: string;
    readonly log: ArchGuardLogger;
    /** `rootDir` + 相对 POSIX 路径 → 绝对路径。 */
    resolveFile(relativePosix: string): string;
    readTextFile(relativePosix: string): string;
    writeTextFile(relativePosix: string, content: string): void;
    /**
     * 替换文本区间。默认保留区间开头的空白/注释 trivia，避免 AST fixer 使用
     * getFullStart() 时把 `&& typeof …` 修成 `&& isString(…)` 这类表达式拼接问题。
     */
    replaceTextRange(relativePosix: string, range: TextReplacementRange, replacement: string, options?: TextReplacementOptions): void;
}
interface TextReplacementRange {
    start: number;
    end: number;
}
interface TextReplacementOptions {
    /** 默认 true；删除类 fix 可显式传 false。 */
    preserveLeadingTrivia?: boolean;
}
declare function createFixContext(rootDir: string, log: ArchGuardLogger): FixContext;
export { createFixContext };
export type { FixContext, TextReplacementOptions, TextReplacementRange };
//# sourceMappingURL=fixContext.d.ts.map