/**
 * Glob 匹配。
 *
 * 本实现通过 `picomatch` 提供跨平台、可预测的 glob 语义：
 *  - 默认开启 `dot: true`，与历史调用方期望（命中 `.cursor/` / `.velar/` 等隐藏目录）一致；
 *  - 保留模块级缓存，避免同一 pattern 在大规模扫描里重复编译；
 *  - 仍以 `compileGlob` / `matchesGlob` / `matchesAnyGlob` 的旧签名导出，所有 check 调用零改动。
 *
 * `picomatch` 是直接运行时依赖，消费者无需额外安装 peer dependency。
 */
import picomatch from 'picomatch';
const compiledCache = new Map();
const matcherCache = new Map();
function compileGlob(pattern) {
    const cached = compiledCache.get(pattern);
    if (cached)
        return cached;
    // picomatch.makeRe 返回标准 RegExp；空 pattern 显式回退为永不命中，
    // 与历史行为（空 pattern 编译出 `/^$/` 这种几乎不可能匹配的正则）保持一致。
    if (!pattern) {
        const empty = /^$/;
        compiledCache.set(pattern, empty);
        return empty;
    }
    const regex = picomatch.makeRe(pattern, { dot: true });
    compiledCache.set(pattern, regex);
    return regex;
}
function getMatcher(pattern) {
    let matcher = matcherCache.get(pattern);
    if (!matcher) {
        matcher = picomatch(pattern, { dot: true });
        matcherCache.set(pattern, matcher);
    }
    return matcher;
}
/** 判定相对路径是否匹配某个 glob 模式。 */
function matchesGlob(relativePath, pattern) {
    if (!pattern)
        return false;
    return getMatcher(pattern)(relativePath);
}
/** 是否匹配 patterns 中至少一个。 */
function matchesAnyGlob(relativePath, patterns) {
    return patterns.some((pattern) => matchesGlob(relativePath, pattern));
}
export { compileGlob, matchesAnyGlob, matchesGlob };
//# sourceMappingURL=glob.js.map