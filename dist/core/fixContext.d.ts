import { type NamedImportPlan } from '../utils/ensureNamedImport.js';
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
    /**
     * 声明「这次改写引入了 `importName` 这个名字，它来自 `moduleSpecifier`」。
     *
     * **不立刻写盘**：import 插在文件头部会把后续所有 offset 顶掉，而同一轮里其它 fixer
     * 拿的还是本轮解析时的 offset。请求会攒起来，由引擎在**本轮全部区间替换落盘之后**统一 flush，
     * flush 时重新读盘、幂等去重。
     */
    requireNamedImport(relativePosix: string, moduleSpecifier: string, importName: string): void;
    /**
     * 改盘**之前**问一句：在 `atOffset` 处引入 `importName` 安不安全。
     *
     * `satisfied` = 那个位置解析到的已经是同模块的值 import；`insert` = 名字自由，补一条即可；
     * `blocked` = 名字被别的东西绑走了（顶层同名声明、别的模块的同名导入、遮蔽顶层的内层变量
     * 或参数）。拿到 `blocked` 的 fixer 应当**放弃整次修复**：补不上 import 就别改表达式，
     * 否则写出的是 `TS2304` + `TS2322` 级联，或者更糟——悄悄接到了另一个同名函数上。
     */
    planNamedImport(relativePosix: string, moduleSpecifier: string, importName: string, atOffset: number): NamedImportPlan;
}
/** 引擎内部使用的 FixContext 面：多出一个 flush 钩子。 */
interface InternalFixContext extends FixContext {
    /** 落盘所有攒起来的 import 请求，返回实际改动的文件数。 */
    flushPendingImports(): number;
}
interface TextReplacementRange {
    start: number;
    end: number;
}
interface TextReplacementOptions {
    /** 默认 true；删除类 fix 可显式传 false。 */
    preserveLeadingTrivia?: boolean;
}
declare function createFixContext(rootDir: string, log: ArchGuardLogger): InternalFixContext;
export { createFixContext };
export type { FixContext, InternalFixContext, NamedImportPlan, TextReplacementOptions, TextReplacementRange, };
//# sourceMappingURL=fixContext.d.ts.map