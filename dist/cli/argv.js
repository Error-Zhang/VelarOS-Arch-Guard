/**
 * 极简 argv 解析器（零依赖）。
 *
 * 支持：
 *   - `--flag` → true
 *   - `--key value`
 *   - `--key=value`
 *   - 重复出现的 `--only x --only y` → string[]
 *
 * 第一个非 option 视为 command，其余为 positional。
 */
function parseArgs(argv) {
    let command = 'run';
    const positionals = [];
    const options = {};
    function setOption(key, value) {
        const existing = options[key];
        if (existing === undefined) {
            options[key] = value;
            return;
        }
        if (typeof existing === 'boolean') {
            options[key] = value;
            return;
        }
        if (Array.isArray(existing)) {
            if (typeof value === 'string')
                existing.push(value);
            return;
        }
        if (typeof value === 'string') {
            options[key] = [existing, value];
        }
    }
    let i = 0;
    let consumedCommand = false;
    while (i < argv.length) {
        const token = argv[i];
        if (token === undefined)
            break;
        if (token.startsWith('--')) {
            const equalsIndex = token.indexOf('=');
            if (equalsIndex !== -1) {
                const key = token.slice(2, equalsIndex);
                const value = token.slice(equalsIndex + 1);
                setOption(key, value);
                i += 1;
                continue;
            }
            const key = token.slice(2);
            const next = argv[i + 1];
            if (next !== undefined && !next.startsWith('--')) {
                setOption(key, next);
                i += 2;
                continue;
            }
            setOption(key, true);
            i += 1;
            continue;
        }
        if (!consumedCommand) {
            command = token;
            consumedCommand = true;
        }
        else {
            positionals.push(token);
        }
        i += 1;
    }
    return { command, positionals, options };
}
/**
 * CLI 认识的全部长选项。
 *
 * 解析器天生宽容：`--dryrun` 会被记成一个谁也不读的 key，然后**静默**丢掉。而 `--dry-run`
 * 是撤回写意图的唯一机制——一个拼写错误就能让它失效，命令照常写盘，什么都不报。
 * 未知选项一律当错误：把「我以为我传了」和「它真的生效了」这两件事重新绑在一起。
 *
 * 新增 flag 必须同步进这张表，否则自己的 CLI 会拒绝自己（这正是想要的提醒）。
 */
const KnownOptions = new Set([
    'adopt-live-message',
    'base',
    'baseline-path',
    'by-tag',
    'changed',
    'config',
    'diff',
    'dry-run',
    'fail-on-stale',
    'file',
    'fix',
    'force',
    'format',
    'help',
    'ids-only',
    'json',
    'log-level',
    'no-baseline',
    'no-fix',
    // 0.2.x 的遗留 flag：仍然接受、已是空操作（`run` 不再 prune）。消费方的脚本里还留着它。
    'no-prune-stale-baseline',
    'no-warn-stale-baseline',
    'only',
    'out',
    'root',
    'skip',
    'staged',
    'tag',
]);
/**
 * 找出 argv 里所有 CLI 不认识的长选项。
 *
 * 建议只做一件事：把连字符抹平再比。`--dryrun` / `--dry_run` / `--dryRun` 都会指回
 * `--dry-run`，而这正是最容易也最贵的那一类手滑。
 */
function findUnknownOptions(args) {
    const flatten = (key) => key.replaceAll(/[-_]/g, '').toLowerCase();
    const byFlattened = new Map();
    for (const known of KnownOptions)
        byFlattened.set(flatten(known), known);
    const unknown = [];
    for (const key of Object.keys(args.options)) {
        if (KnownOptions.has(key))
            continue;
        unknown.push({ key, suggestion: byFlattened.get(flatten(key)) });
    }
    return unknown;
}
function toStringArray(value) {
    if (value === undefined || typeof value === 'boolean')
        return [];
    return Array.isArray(value) ? value : [value];
}
function toBoolean(value) {
    return value === true || value === 'true';
}
function toString(value) {
    if (typeof value === 'string')
        return value;
    return undefined;
}
function toOptionalFixFlag(value) {
    if (value === true || value === 'true')
        return true;
    if (value === false || value === 'false')
        return false;
    return undefined;
}
/**
 * CLI：`--no-fix` 优先于 `--fix`；均未传时返回 `undefined`（沿用配置文件 `fix`）。
 */
function resolveCliFix(args) {
    if (toBoolean(args.options['no-fix']))
        return false;
    const explicit = toOptionalFixFlag(args.options.fix);
    if (explicit !== undefined)
        return explicit;
    return undefined;
}
export { findUnknownOptions, KnownOptions, parseArgs, resolveCliFix, toBoolean, toString, toStringArray };
//# sourceMappingURL=argv.js.map