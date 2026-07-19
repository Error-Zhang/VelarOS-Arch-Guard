/** 提取一段源码中所有 import / export-from / 动态 import 的 specifier。 */
declare function extractImports(source: string): string[];
/** alias 描述：把 `@/x` 类前缀映射到仓库内的目录。 */
interface ImportAlias {
    /** 形如 `@`, `@shared`, `@hooks` 等前缀，不带斜杠。 */
    prefix: string;
    /** 解析目标的绝对路径或相对项目根的相对路径。 */
    target: string;
}
interface AliasResolverOptions {
    rootDir: string;
    aliases: readonly ImportAlias[];
}
/**
 * 按用户提供的 alias 表，把 import specifier 解析成项目内绝对路径。
 *
 * - `./xx` `../xx` 类相对路径会基于 fromFile 解析。
 * - 命中 alias 时返回拼接后的绝对路径（注意：不强制 `.ts` 后缀，调用方自行尝试解析）。
 * - 其它情况视为外部包导入。
 */
declare function createAliasResolver(options: AliasResolverOptions): (fromFile: string, specifier: string) => string | null;
/** 解析"@scope/pkg/sub/path" → "@scope/pkg"；非 scoped 包返回 `pkg`。 */
declare function getPackageNameFromSpecifier(specifier: string): string | null;
export { createAliasResolver, extractImports, getPackageNameFromSpecifier };
export type { AliasResolverOptions, ImportAlias };
//# sourceMappingURL=imports.d.ts.map