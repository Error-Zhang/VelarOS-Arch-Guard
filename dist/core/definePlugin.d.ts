import type { Check } from './defineCheck.js';
import type { SeverityLevel } from './severity.js';
/**
 * 插件定义。
 *
 * Plugin 是 arch-guard 的扩展单元：
 * - `checks`：本插件提供的 check 列表（项目特有规则通常通过 plugin 注入）。
 * - `presets`：提供"打包好"的内置 check 配置（例如 default-typescript / strict-monorepo）。
 * - `defaults`：为某些 check 提供默认 options（如把项目路径注入到通用规则中）。
 * - `severities`：调整某些 check 的默认严重级别。
 *
 * 用户在 arch-guard.config 中 `plugins: [myPlugin()]` 注册，引擎会按顺序合并。
 */
interface Plugin {
    name: string;
    version?: string;
    checks?: readonly Check[];
    defaults?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
    severities?: Readonly<Record<string, SeverityLevel>>;
    /** 配置自检：plugin 加载后被调用，发现配置问题应该抛错。 */
    validate?: (context: PluginValidateContext) => void | Promise<void>;
}
interface PluginValidateContext {
    rootDir: string;
}
interface PluginInput {
    name: string;
    version?: string;
    checks?: readonly Check[];
    defaults?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
    severities?: Readonly<Record<string, SeverityLevel>>;
    validate?: (context: PluginValidateContext) => void | Promise<void>;
}
/** 工厂：创建并冻结一个 Plugin。 */
declare function definePlugin(input: PluginInput): Plugin;
export { definePlugin };
export type { Plugin, PluginInput, PluginValidateContext };
//# sourceMappingURL=definePlugin.d.ts.map