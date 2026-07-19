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
declare function compileGlob(pattern: string): RegExp;
/** 判定相对路径是否匹配某个 glob 模式。 */
declare function matchesGlob(relativePath: string, pattern: string): boolean;
/** 是否匹配 patterns 中至少一个。 */
declare function matchesAnyGlob(relativePath: string, patterns: readonly string[]): boolean;
export { compileGlob, matchesAnyGlob, matchesGlob };
//# sourceMappingURL=glob.d.ts.map