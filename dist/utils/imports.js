import { dirname, resolve } from 'node:path';
/** 提取一段源码中所有 import / export-from / 动态 import 的 specifier。 */
function extractImports(source) {
    const patterns = [
        /from\s+['"]([^'"]+)['"]/g,
        /import\s+['"]([^'"]+)['"]/g,
        /import\(\s*['"]([^'"]+)['"]\s*\)/g,
        /require\(\s*['"]([^'"]+)['"]\s*\)/g,
    ];
    const seen = new Set();
    for (const pattern of patterns) {
        for (const match of source.matchAll(pattern)) {
            if (match[1] !== undefined)
                seen.add(match[1]);
        }
    }
    return [...seen];
}
/**
 * 按用户提供的 alias 表，把 import specifier 解析成项目内绝对路径。
 *
 * - `./xx` `../xx` 类相对路径会基于 fromFile 解析。
 * - 命中 alias 时返回拼接后的绝对路径（注意：不强制 `.ts` 后缀，调用方自行尝试解析）。
 * - 其它情况视为外部包导入。
 */
function createAliasResolver(options) {
    const sortedAliases = [...options.aliases].sort((a, b) => b.prefix.length - a.prefix.length);
    return function resolveImportSpecifier(fromFile, specifier) {
        if (specifier.startsWith('.'))
            return resolve(dirname(fromFile), specifier);
        for (const alias of sortedAliases) {
            if (specifier === alias.prefix)
                return resolve(options.rootDir, alias.target);
            if (specifier.startsWith(`${alias.prefix}/`))
                return resolve(options.rootDir, alias.target, specifier.slice(alias.prefix.length + 1));
        }
        return null;
    };
}
/** 解析"@scope/pkg/sub/path" → "@scope/pkg"；非 scoped 包返回 `pkg`。 */
function getPackageNameFromSpecifier(specifier) {
    const scoped = specifier.match(/^(@[^/]+\/[^/]+)(?:\/|$)/);
    if (scoped?.[1])
        return scoped[1];
    const bare = specifier.match(/^([^./@][^/]*)(?:\/|$)/);
    if (bare?.[1])
        return bare[1];
    return null;
}
export { createAliasResolver, extractImports, getPackageNameFromSpecifier };
//# sourceMappingURL=imports.js.map