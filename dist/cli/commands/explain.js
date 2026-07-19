import { loadConfig } from '../../config/loadConfig.js';
import { collectAllChecks, effectiveSeverity } from '../../core/runner.js';
import { toString } from '../argv.js';
/**
 * `arch-guard explain <check-id>`：打印某条 check 的完整说明。
 */
async function explainCommand(args) {
    const checkId = args.positionals[0];
    if (!checkId) {
        console.error('Usage: arch-guard explain <check-id>');
        return 2;
    }
    const config = await loadConfig({
        configPath: toString(args.options.config),
        rootDir: toString(args.options.root),
    });
    const all = collectAllChecks(config);
    const found = all.find((check) => check.id === checkId);
    if (!found) {
        console.error(`arch-guard: no check with id "${checkId}".`);
        return 2;
    }
    console.info(`${found.id}`);
    console.info(`title: ${found.title}`);
    if (found.tags && found.tags.length > 0) {
        console.info(`tags: ${found.tags.join(', ')}`);
    }
    console.info(`severity: ${effectiveSeverity(found, config)}`);
    console.info('');
    console.info(found.description);
    console.info('');
    console.info('Verifies:');
    for (const item of found.verifies) {
        console.info(`  - ${item}`);
    }
    return 0;
}
export { explainCommand };
//# sourceMappingURL=explain.js.map