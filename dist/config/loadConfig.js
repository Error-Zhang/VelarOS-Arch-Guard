import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const DefaultConfigFileNames = [
    'arch-guard.config.mjs',
    'arch-guard.config.js',
    'arch-guard.config.cjs',
    'arch-guard.config.json',
];
/** 在指定目录按 DefaultConfigFileNames 顺序查找首个存在的配置文件。 */
function findConfigPath(searchFrom) {
    for (const name of DefaultConfigFileNames) {
        const candidate = resolve(searchFrom, name);
        if (existsSync(candidate))
            return candidate;
    }
    return null;
}
async function importConfigModule(filePath) {
    if (filePath.endsWith('.json')) {
        const { readFile } = await import('node:fs/promises');
        const text = await readFile(filePath, 'utf-8');
        return JSON.parse(text);
    }
    const url = pathToFileURL(filePath).href;
    const imported = (await import(url));
    return imported.default ?? imported;
}
/**
 * 加载并归一用户配置。
 *
 * - 同时支持 `export default defineConfig({...})` 和 `module.exports = {...}`。
 * - rootDir 优先使用 user/CLI 提供，否则取 config 文件所在目录。
 * - 不做插件 validate 调用（那是 runner 的职责），仅做结构校验。
 */
async function loadConfig(options = {}) {
    const searchFrom = options.searchFrom ?? process.cwd();
    const configPath = options.configPath
        ? resolve(searchFrom, options.configPath)
        : findConfigPath(searchFrom);
    if (!configPath || !existsSync(configPath)) {
        if (options.configPath) {
            throw new Error(`arch-guard: config file not found at ${configPath}`);
        }
        return finalizeConfig({ plugins: [], checks: [], rules: {} }, options.rootDir ?? searchFrom);
    }
    const loaded = await importConfigModule(configPath);
    const userConfig = normalizeUserConfig(loaded, configPath);
    const rootDir = options.rootDir ?? userConfig.rootDir ?? dirname(configPath);
    return finalizeConfig(userConfig, rootDir);
}
function normalizeUserConfig(value, configPath) {
    if (!value || typeof value !== 'object') {
        throw new Error(`arch-guard: ${configPath} must export an object.`);
    }
    return value;
}
function finalizeConfig(user, rootDir) {
    const resolved = {
        rootDir,
        plugins: Object.freeze([...(user.plugins ?? [])]),
        checks: Object.freeze([...(user.checks ?? [])]),
    };
    if (user.rules) {
        resolved.rules = Object.freeze({ ...user.rules });
    }
    if (user.excludeDirNames) {
        resolved.excludeDirNames = new Set(user.excludeDirNames);
    }
    if (user.files) {
        const files = {};
        if (user.files.roots) {
            files.roots = Object.freeze([...user.files.roots]);
        }
        if (user.files.extensions) {
            files.extensions = Object.freeze([...user.files.extensions]);
        }
        if (user.files.includePatterns) {
            files.includePatterns = Object.freeze([...user.files.includePatterns]);
        }
        if (user.files.excludePatterns) {
            files.excludePatterns = Object.freeze([...user.files.excludePatterns]);
        }
        resolved.files = Object.freeze(files);
    }
    if (user.fix !== undefined) {
        resolved.fix = user.fix;
    }
    return resolved;
}
export { DefaultConfigFileNames, findConfigPath, loadConfig };
//# sourceMappingURL=loadConfig.js.map