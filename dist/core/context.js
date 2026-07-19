import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { matchesAnyGlob } from '../utils/glob.js';
import { normalizePathSeparators } from '../utils/paths.js';
/**
 * 共享文件清单收集器。
 *
 * 把"扫目录 + 过滤后缀"的工作收敛到一处，多个 check 共享同一份扫描结果。
 * 文件扫描时按 `roots × extensions` 缓存，避免相同输入被反复 walk。
 */
class FileCollections {
    rootDir;
    excludeDirNames;
    fileScope;
    cache = new Map();
    constructor(rootDir, excludeDirNames, fileScope) {
        this.rootDir = rootDir;
        this.excludeDirNames = excludeDirNames;
        this.fileScope = fileScope;
    }
    /** 收集所有匹配后缀的文件（按 roots 路径递归）。结果按文件 fullPath 升序。 */
    collect(roots, extensions) {
        const scopedRoots = restrictRoots(roots, this.fileScope?.roots);
        const scopedExtensions = restrictExtensions(extensions, this.fileScope?.extensions);
        const cacheKey = `${scopedRoots.sort().join('|')}::${[...scopedExtensions].sort().join(',')}`;
        const cached = this.cache.get(cacheKey);
        if (cached)
            return cached;
        if (scopedRoots.length === 0 || scopedExtensions.size === 0) {
            this.cache.set(cacheKey, []);
            return [];
        }
        const files = [];
        for (const root of scopedRoots) {
            const absoluteRoot = resolve(this.rootDir, root);
            if (!existsSync(absoluteRoot))
                continue;
            this.walk(absoluteRoot, scopedExtensions, files);
        }
        files.sort();
        this.cache.set(cacheKey, files);
        return files;
    }
    /** 按 include/exclude glob 过滤已有清单。 */
    filter(files, include, exclude) {
        return files.filter((file) => {
            const relative = normalizePathSeparators(file).slice(normalizePathSeparators(this.rootDir).length + 1);
            if (include && include.length > 0 && !matchesAnyGlob(relative, include))
                return false;
            if (this.fileScope?.includePatterns &&
                !matchesAnyGlob(relative, this.fileScope.includePatterns))
                return false;
            if (exclude && exclude.length > 0 && matchesAnyGlob(relative, exclude))
                return false;
            if (this.fileScope?.excludePatterns &&
                matchesAnyGlob(relative, this.fileScope.excludePatterns))
                return false;
            return true;
        });
    }
    walk(dir, extensions, out) {
        let entries;
        try {
            entries = readdirSync(dir);
        }
        catch {
            return;
        }
        for (const entry of entries) {
            if (this.excludeDirNames.has(entry))
                continue;
            const fullPath = resolve(dir, entry);
            let stats;
            try {
                stats = statSync(fullPath);
            }
            catch {
                continue;
            }
            if (stats.isDirectory()) {
                this.walk(fullPath, extensions, out);
                continue;
            }
            if (extensions.has(extname(fullPath))) {
                const relative = normalizePathSeparators(fullPath).slice(normalizePathSeparators(this.rootDir).length + 1);
                if ((!this.fileScope?.includePatterns ||
                    matchesAnyGlob(relative, this.fileScope.includePatterns)) &&
                    (!this.fileScope?.excludePatterns ||
                        !matchesAnyGlob(relative, this.fileScope.excludePatterns))) {
                    out.push(fullPath);
                }
            }
        }
    }
}
/**
 * 跨 check 共享的轻量缓存：
 * - 源文件文本：按 (path, mtimeMs, size) 缓存
 * - 自定义 AST/解析结果：用户在 check 中按 key 存取
 *
 * 缓存只在同一次 run 内有效，进程结束即丢弃；不写磁盘。
 */
class SharedCache {
    sourceCache = new Map();
    anyCache = new Map();
    /** 读取源文件文本；命中缓存时不再重新读盘。 */
    readSource(filePath) {
        const stats = statSync(filePath);
        const cached = this.sourceCache.get(filePath);
        if (cached && cached.mtimeMs === stats.mtimeMs && cached.size === stats.size)
            return cached.text;
        const text = readFileSync(filePath, 'utf-8');
        this.sourceCache.set(filePath, { mtimeMs: stats.mtimeMs, size: stats.size, text });
        return text;
    }
    /** 通用 memo：第一次调用 factory，后续直接复用结果。 */
    memo(key, factory) {
        if (this.anyCache.has(key))
            return this.anyCache.get(key);
        const value = factory();
        this.anyCache.set(key, value);
        return value;
    }
    /** autofix 改写磁盘后丢弃缓存，下一轮 check pass 会重新读盘。 */
    clear() {
        this.sourceCache.clear();
        this.anyCache.clear();
    }
}
const DefaultExcludeDirNames = new Set([
    'node_modules',
    '.git',
    'dist',
    'build',
    'out',
    'coverage',
    '.next',
    '.turbo',
    '.cache',
]);
/** 构造一次 run 使用的共享上下文。 */
function createSharedContext(options) {
    const excludeDirNames = options.excludeDirNames ?? DefaultExcludeDirNames;
    return {
        rootDir: options.rootDir,
        files: new FileCollections(options.rootDir, excludeDirNames, options.fileScope),
        cache: new SharedCache(),
        log: options.logger,
    };
}
function restrictRoots(requestedRoots, configuredRoots) {
    if (!configuredRoots || configuredRoots.length === 0)
        return [...requestedRoots];
    const result = new Set();
    for (const requested of requestedRoots.map(normalizeRelativeRoot)) {
        for (const configured of configuredRoots.map(normalizeRelativeRoot)) {
            if (requested === configured) {
                result.add(requested);
            }
            else if (isPathWithin(configured, requested)) {
                result.add(configured);
            }
            else if (isPathWithin(requested, configured)) {
                result.add(requested);
            }
        }
    }
    return [...result];
}
function restrictExtensions(requestedExtensions, configuredExtensions) {
    if (!configuredExtensions || configuredExtensions.length === 0)
        return requestedExtensions;
    const allowed = new Set(configuredExtensions);
    return new Set([...requestedExtensions].filter((extension) => allowed.has(extension)));
}
function normalizeRelativeRoot(root) {
    const normalized = normalizePathSeparators(root)
        .replace(/^\.?\//, '')
        .replace(/\/+$/, '');
    return normalized || '.';
}
function isPathWithin(candidate, parent) {
    if (parent === '.')
        return true;
    return candidate === parent || candidate.startsWith(`${parent}/`);
}
export { createSharedContext, DefaultExcludeDirNames, FileCollections, SharedCache };
//# sourceMappingURL=context.js.map