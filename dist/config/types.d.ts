import type { Check } from '../core/defineCheck.js';
import type { Plugin } from '../core/definePlugin.js';
import type { SeverityLevel } from '../core/severity.js';
/**
 * 用户 arch-guard.config 的入参形态（可省字段较多）。
 *
 * `rootDir` 不传时由 loader 推断为 config 文件所在目录。
 * `plugins` 是注入项目特有规则的主通道。
 * `checks` 用于注入临时/局部的 check（不需要单独包装成 plugin）。
 * `rules` 用于覆盖任意 check 的 severity / options。
 */
interface UserConfig {
    rootDir?: string;
    plugins?: readonly Plugin[];
    checks?: readonly Check[];
    rules?: Readonly<Record<string, RuleOverride>>;
    excludeDirNames?: readonly string[];
    files?: FileScopeConfig;
    /**
     * 是否允许在 `arch-guard run` 中对带 `applyFix` 的违规尝试自动修复。
     * CLI `--fix` / `--no-fix` 优先于本字段。
     */
    fix?: boolean;
}
type RuleOverride = false | SeverityLevel | {
    severity?: SeverityLevel;
    options?: Readonly<Record<string, unknown>>;
    /** `false`：该 check 报告的违规不允许自动修复（即使全局 `fix: true`）。 */
    fix?: boolean;
    /**
     * 抑制 check 内部指定的 section（按 section title 完全匹配）。
     *
     * 用于在聚合 check 中只关闭其中一个有稳定标题的子规则。
     * 例如配置 `suppressSections: ['Generated file exceptions']`。
     */
    suppressSections?: readonly string[];
};
interface FileScopeConfig {
    /** 全局扫描根目录。check 自身传入 roots 时会与这里取交集。 */
    roots?: readonly string[];
    /** 全局允许的扩展名。check 自身传入 extensions 时会与这里取交集。 */
    extensions?: readonly string[];
    /** 全局 include glob。适合 CLI 指定文件 / changed-files 增量运行。 */
    includePatterns?: readonly string[];
    /** 全局排除 glob。无论 check 是否传入 exclude 都会生效。 */
    excludePatterns?: readonly string[];
}
/** Runner 接收的归一化配置。 */
interface ResolvedConfig {
    rootDir: string;
    plugins: readonly Plugin[];
    checks: readonly Check[];
    rules?: Readonly<Record<string, RuleOverride>>;
    excludeDirNames?: ReadonlySet<string>;
    files?: FileScopeConfig;
    fix?: boolean;
}
export type { FileScopeConfig, ResolvedConfig, RuleOverride, UserConfig };
//# sourceMappingURL=types.d.ts.map