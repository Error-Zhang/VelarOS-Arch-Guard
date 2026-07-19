import { loadConfig } from '../../config/loadConfig.js';
import { resolveBaselinePath, runArchGuard } from '../../core/runner.js';
import { githubReporter } from '../../reporters/github.js';
import { jsonReporter } from '../../reporters/json.js';
import { sarifReporter } from '../../reporters/sarif.js';
import { stylishReporter } from '../../reporters/stylish.js';
import { resolveCliFix, toBoolean, toString, toStringArray } from '../argv.js';
import { applyCliFileScope } from '../fileScope.js';
/**
 * `arch-guard run`：执行所有（或过滤后）的 checks，按 reporter 输出。
 *
 * 常用 flag：
 *   --config <path>           显式指定配置文件
 *   --root <path>             显式 rootDir
 *   --only <id>               只跑指定 id（可重复）
 *   --skip <id>               跳过指定 id（可重复）
 *   --tag <tag>               按 tag 过滤（可重复）
 *   --file <path>             只检查指定文件 / 目录 / glob（可重复）
 *   --changed                 只检查当前 git diff + 未跟踪文件
 *   --staged                  只检查暂存区文件
 *   --format stylish|json|sarif|github  选择 reporter（可重复，多 reporter 串联）
 *   --out <path>              json/sarif 输出文件
 *   --no-baseline             忽略 baseline 文件
 *   --fix                     对支持自动修复的违规尝试修复（覆盖配置里的 fix；见 README）
 *   --no-fix                  关闭自动修复（覆盖配置里的 fix: true）
 *   --baseline-path <path>    自定义 baseline 文件
 *   --no-prune-stale-baseline 不自动移除已解决的 baseline 项
 *   --log-level error|warn|info|debug
 */
async function runCommand(args) {
    const config = await loadConfig({
        configPath: toString(args.options.config),
        rootDir: toString(args.options.root),
    });
    const fileScope = applyCliFileScope(config, args);
    const reporters = buildReporters(args);
    const result = await runArchGuard({
        config: fileScope.config,
        filter: {
            only: toStringArray(args.options.only),
            skip: toStringArray(args.options.skip),
            tags: toStringArray(args.options.tag),
        },
        reporters,
        logLevel: toString(args.options['log-level']) ?? 'warn',
        ignoreBaseline: toBoolean(args.options['no-baseline']),
        baselinePath: toString(args.options['baseline-path']) ?? resolveBaselinePath(config.rootDir),
        warnStaleBaseline: !toBoolean(args.options['no-warn-stale-baseline']),
        pruneStaleBaseline: !toBoolean(args.options['no-prune-stale-baseline']),
        fix: resolveCliFix(args),
        fileScopeActive: fileScope.active,
    });
    return result.exitCode;
}
function buildReporters(args) {
    const formats = toStringArray(args.options.format);
    if (formats.length === 0)
        return [stylishReporter];
    const out = toString(args.options.out);
    const result = [];
    for (const format of formats) {
        const fmt = format.toLowerCase();
        if (fmt === 'stylish')
            result.push(stylishReporter);
        else if (fmt === 'json')
            result.push(jsonReporter({ ...(out ? { out } : {}) }));
        else if (fmt === 'sarif')
            result.push(sarifReporter({ ...(out ? { out } : {}) }));
        else if (fmt === 'github')
            result.push(githubReporter);
        else
            throw new Error(`arch-guard: unrecognized --format "${format}".`);
    }
    return result;
}
export { runCommand };
//# sourceMappingURL=run.js.map