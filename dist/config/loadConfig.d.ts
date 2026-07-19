import type { ResolvedConfig } from './types.js';
declare const DefaultConfigFileNames: string[];
interface LoadConfigOptions {
    /** 显式指定配置文件路径；不传时按 DefaultConfigFileNames 在 cwd 顺序查找。 */
    configPath?: string;
    /** 显式覆盖 rootDir。 */
    rootDir?: string;
    /** 起始搜索目录，默认 process.cwd()。 */
    searchFrom?: string;
}
/** 在指定目录按 DefaultConfigFileNames 顺序查找首个存在的配置文件。 */
declare function findConfigPath(searchFrom: string): string | null;
/**
 * 加载并归一用户配置。
 *
 * - 同时支持 `export default defineConfig({...})` 和 `module.exports = {...}`。
 * - rootDir 优先使用 user/CLI 提供，否则取 config 文件所在目录。
 * - 不做插件 validate 调用（那是 runner 的职责），仅做结构校验。
 */
declare function loadConfig(options?: LoadConfigOptions): Promise<ResolvedConfig>;
export { DefaultConfigFileNames, findConfigPath, loadConfig };
export type { LoadConfigOptions };
//# sourceMappingURL=loadConfig.d.ts.map