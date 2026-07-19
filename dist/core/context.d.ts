import type { FileScopeConfig } from '../config/types.js';
import type { ArchGuardLogger } from './logger.js';
/**
 * 共享文件清单收集器。
 *
 * 把"扫目录 + 过滤后缀"的工作收敛到一处，多个 check 共享同一份扫描结果。
 * 文件扫描时按 `roots × extensions` 缓存，避免相同输入被反复 walk。
 */
declare class FileCollections {
    private readonly rootDir;
    private readonly excludeDirNames;
    private readonly fileScope?;
    private readonly cache;
    constructor(rootDir: string, excludeDirNames: ReadonlySet<string>, fileScope?: FileScopeConfig);
    /** 收集所有匹配后缀的文件（按 roots 路径递归）。结果按文件 fullPath 升序。 */
    collect(roots: readonly string[], extensions: ReadonlySet<string>): string[];
    /** 按 include/exclude glob 过滤已有清单。 */
    filter(files: readonly string[], include?: readonly string[], exclude?: readonly string[]): string[];
    private walk;
}
/**
 * 跨 check 共享的轻量缓存：
 * - 源文件文本：按 (path, mtimeMs, size) 缓存
 * - 自定义 AST/解析结果：用户在 check 中按 key 存取
 *
 * 缓存只在同一次 run 内有效，进程结束即丢弃；不写磁盘。
 */
declare class SharedCache {
    private readonly sourceCache;
    private readonly anyCache;
    /** 读取源文件文本；命中缓存时不再重新读盘。 */
    readSource(filePath: string): string;
    /** 通用 memo：第一次调用 factory，后续直接复用结果。 */
    memo<T>(key: string, factory: () => T): T;
    /** autofix 改写磁盘后丢弃缓存，下一轮 check pass 会重新读盘。 */
    clear(): void;
}
interface CreateContextOptions {
    rootDir: string;
    excludeDirNames?: ReadonlySet<string>;
    fileScope?: FileScopeConfig;
    logger: ArchGuardLogger;
}
interface ArchGuardSharedContext {
    rootDir: string;
    files: FileCollections;
    cache: SharedCache;
    log: ArchGuardLogger;
}
declare const DefaultExcludeDirNames: Set<string>;
/** 构造一次 run 使用的共享上下文。 */
declare function createSharedContext(options: CreateContextOptions): ArchGuardSharedContext;
export { createSharedContext, DefaultExcludeDirNames, FileCollections, SharedCache };
export type { ArchGuardSharedContext };
//# sourceMappingURL=context.d.ts.map