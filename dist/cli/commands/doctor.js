import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig } from '../../config/loadConfig.js';
import { toString } from '../argv.js';
/**
 * `arch-guard doctor`：配置健康检查。
 *
 * - 找不到配置文件时报警但不失败。
 * - 校验 plugin 列表中的每个 plugin.validate（如果定义）。
 * - 校验 check id 是否唯一。
 * - 校验 rules 中引用的 check id 是否真实存在。
 */
async function doctorCommand(args) {
    const config = await loadConfig({
        configPath: toString(args.options.config),
        rootDir: toString(args.options.root),
    });
    const issues = [];
    if (!existsSync(resolve(config.rootDir, 'package.json'))) {
        issues.push(`No package.json was found under rootDir ${config.rootDir}. Check rootDir.`);
    }
    for (const plugin of config.plugins) {
        if (typeof plugin.validate === 'function') {
            try {
                await plugin.validate({ rootDir: config.rootDir });
            }
            catch (error) {
                issues.push(`plugin "${plugin.name}" validate failed: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }
    const idCounts = new Map();
    for (const check of [...config.checks, ...config.plugins.flatMap((p) => p.checks ?? [])]) {
        idCounts.set(check.id, (idCounts.get(check.id) ?? 0) + 1);
    }
    for (const [id, count] of idCounts) {
        if (count > 1)
            issues.push(`Check id "${id}" appears ${count} times; ids must be unique.`);
    }
    if (config.rules) {
        const knownIds = new Set([
            ...config.checks.map((check) => check.id),
            ...config.plugins.flatMap((plugin) => (plugin.checks ?? []).map((check) => check.id)),
        ]);
        for (const id of Object.keys(config.rules)) {
            if (!knownIds.has(id)) {
                issues.push(`Rules reference unknown check id "${id}".`);
            }
        }
    }
    if (issues.length === 0) {
        console.info(`arch-guard: doctor passed (rootDir=${config.rootDir}).`);
        return 0;
    }
    console.error(`arch-guard: doctor found ${issues.length} issue(s):`);
    for (const issue of issues) {
        console.error(`  - ${issue}`);
    }
    return 1;
}
export { doctorCommand };
//# sourceMappingURL=doctor.js.map