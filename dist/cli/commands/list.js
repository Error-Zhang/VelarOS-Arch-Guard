import { loadConfig } from '../../config/loadConfig.js';
import { collectAllChecks, effectiveSeverity } from '../../core/runner.js';
import { toBoolean, toString } from '../argv.js';
/**
 * `arch-guard list`：列出当前配置激活的所有 checks。
 *
 * 输出模式：
 *   - 默认：human-readable，按 id 顺序展开 title/tags/severity/description/verifies。
 *   - `--by-tag`：按 tag 分组，便于看清规则覆盖的领域分布。
 *   - `--json`：机器可读，AI agent / CI 解析友好。
 *   - `--ids-only`：只打印 id 列表，每行一个，方便管道。
 */
async function listCommand(args) {
    const config = await loadConfig({
        configPath: toString(args.options.config),
        rootDir: toString(args.options.root),
    });
    const allChecks = collectAllChecks(config).slice().sort((a, b) => a.id.localeCompare(b.id));
    if (allChecks.length === 0) {
        if (toBoolean(args.options.json)) {
            console.info(JSON.stringify({ total: 0, checks: [] }, null, 2));
        }
        else {
            console.info('arch-guard: no checks registered. Add a plugin or `checks` array to arch-guard.config.');
        }
        return 0;
    }
    if (toBoolean(args.options['ids-only'])) {
        for (const check of allChecks)
            console.info(check.id);
        return 0;
    }
    if (toBoolean(args.options.json)) {
        const payload = {
            total: allChecks.length,
            checks: allChecks.map((check) => ({
                id: check.id,
                title: check.title,
                description: check.description,
                verifies: [...check.verifies],
                tags: check.tags ? [...check.tags] : [],
                severity: effectiveSeverity(check, config),
            })),
        };
        console.info(JSON.stringify(payload, null, 2));
        return 0;
    }
    if (toBoolean(args.options['by-tag'])) {
        const byTag = new Map();
        for (const check of allChecks) {
            const tags = check.tags && check.tags.length > 0 ? check.tags : ['(untagged)'];
            for (const tag of tags) {
                if (!byTag.has(tag))
                    byTag.set(tag, []);
                byTag.get(tag).push(check);
            }
        }
        const sortedTags = [...byTag.keys()].sort();
        console.info(`arch-guard: ${allChecks.length} checks across ${sortedTags.length} tags.\n`);
        for (const tag of sortedTags) {
            const checks = byTag.get(tag);
            console.info(`# ${tag} (${checks.length})`);
            for (const check of checks) {
                console.info(`  ${check.id}  —  ${check.title}`);
            }
            console.info('');
        }
        return 0;
    }
    console.info(`arch-guard: ${allChecks.length} checks registered.\n`);
    for (const check of allChecks) {
        console.info(`${check.id}`);
        console.info(`  title: ${check.title}`);
        if (check.tags && check.tags.length > 0) {
            console.info(`  tags: ${check.tags.join(', ')}`);
        }
        console.info(`  severity: ${effectiveSeverity(check, config)}`);
        console.info(`  description: ${check.description}`);
        console.info('  verifies:');
        for (const item of check.verifies) {
            console.info(`    - ${item}`);
        }
        console.info('');
    }
    return 0;
}
export { listCommand };
//# sourceMappingURL=list.js.map