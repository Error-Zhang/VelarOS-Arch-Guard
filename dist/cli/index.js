import { baselineCommand } from './commands/baseline.js';
import { doctorCommand } from './commands/doctor.js';
import { explainCommand } from './commands/explain.js';
import { initCommand } from './commands/init.js';
import { listCommand } from './commands/list.js';
import { runCommand } from './commands/run.js';
import { verifyCommand } from './commands/verify.js';
import { findUnknownOptions, parseArgs, toBoolean } from './argv.js';
const KnownCommands = new Set([
    'baseline',
    'doctor',
    'explain',
    'help',
    'init',
    'list',
    'run',
    'verify',
    '--help',
    '-h',
]);
const Help = `arch-guard <command> [files...] [options]

Commands:
  run                          Run all checks (default). Full violation output.
  verify                       Run and print one-line summary only. CI / AI agent friendly.
  list                         List all registered checks (supports --by-tag / --json / --ids-only).
  explain <check-id>           Show details for a single check.
  baseline update              Re-freeze violations. Honours --file/--changed/--only (scoped merge).
  baseline prune               Retire baseline entries that no longer match. The only pruning entry point.
  baseline migrate             Backfill contentDigest + count on existing entries; reports collisions.
  baseline check               Verify the baseline covers every violation (never writes).
                               ("baseline" with no sub-command prints this and exits 2.)
  doctor                       Validate config + plugins + rules consistency.
  init                         Create a safe starter arch-guard.config.mjs.
  help                         Show this help.

Common options:
  --config <path>              Path to arch-guard.config.{mjs,js,cjs,json}.
  --root <path>                Override project root directory.
  --only <id>                  Run only the given check id (repeatable).
  --skip <id>                  Skip the given check id (repeatable).
  --tag <tag>                  Run only checks with this tag (repeatable).
  --file <path>                Run only on a file / directory / glob (repeatable).
  --changed, --diff            Run only on current git diff + untracked files.
  --staged                     Run only on staged files.
  --base <ref>                 With --changed, diff against the given git ref.
  --format <stylish|json|sarif|github>   Reporter (repeatable).
  --out <path>                 Output file for json/sarif reporters.
  --no-baseline                Ignore baseline file.
  --baseline-path <path>       Override baseline file path.
  --fail-on-stale              (run / verify) Fail when the baseline still freezes already-fixed debt.
  --fix                        Apply supported auto-fixes after checks (overrides config fix flag).
  --no-fix                     Disable auto-fix (overrides config when fix is enabled).
  --log-level <error|warn|info|debug>
  --json                       (verify / list) Emit machine-readable JSON output.
  --by-tag                     (list) Group checks by tag instead of listing each one.
  --ids-only                   (list) Emit just the check ids, one per line.
  --dry-run                    (baseline) Print what would change; never write.
  --force                      (baseline prune) Allow pruning even when this run matched nothing.
  --adopt-live-message         (baseline migrate) Trust current code over the frozen message on a mismatch.

Read-only commands never write the baseline. \`run\` no longer prunes; \`--no-prune-stale-baseline\`
is accepted and ignored. Use \`arch-guard baseline prune\` to retire fixed debt.

A file scope that resolves to zero scannable files (e.g. \`--changed\` when the diff is all .md) is
a no-op, never a whole-repository re-freeze. Only \`baseline update\`, \`baseline prune\` and
\`baseline migrate\` may write, and only when the content actually changes. Read-only commands
still run, but they say out loud that no file was scanned — "scanned nothing" is not "found nothing".

\`--skip\` does not narrow the scope: it names what to leave out, so everything else is still the
whole repository. Narrow a \`baseline update\` with \`--file\` / \`--changed\` / \`--only\` / \`--tag\`.

Unknown long options are rejected (exit 2) rather than ignored — a typo in \`--dry-run\` must not
silently turn into a write.
`;
/** CLI 入口；返回 exit code 由 bin 启动器消费。 */
async function runCli(argv) {
    const parsed = normalizeDefaultRunCommand(parseArgs(argv));
    if (toBoolean(parsed.options.help)) {
        console.info(Help);
        return 0;
    }
    const rejected = rejectUnknownOptions(parsed);
    if (rejected !== 0)
        return rejected;
    switch (parsed.command) {
        case 'help':
        case '--help':
        case '-h':
            console.info(Help);
            return 0;
        case 'list':
            return listCommand(parsed);
        case 'verify':
            return verifyCommand(parsed);
        case 'explain':
            return explainCommand(parsed);
        case 'baseline':
            return baselineCommand(parsed);
        case 'doctor':
            return doctorCommand(parsed);
        case 'init':
            return initCommand(parsed);
        case 'run':
        default:
            return runCommand(parsed);
    }
}
/**
 * 不认识的长选项一律拒绝，exit 2。
 *
 * 宽容解析在这里是净负债：`--dry-run` 打成 `--dryrun` 就静默失效，`baseline update` 照常
 * 写盘；`--no-fix` 打错就变成真改代码。会改盘的 CLI 不能把手滑当成沉默的同意。
 */
function rejectUnknownOptions(parsed) {
    const unknown = findUnknownOptions(parsed);
    if (unknown.length === 0)
        return 0;
    for (const { key, suggestion } of unknown) {
        console.error(`arch-guard: unknown option \`--${key}\`` +
            (suggestion === undefined ? '.' : `. Did you mean \`--${suggestion}\`?`));
    }
    console.error('arch-guard: run `arch-guard help` for the supported options.');
    return 2;
}
function normalizeDefaultRunCommand(parsed) {
    if (KnownCommands.has(parsed.command))
        return parsed;
    return {
        ...parsed,
        command: 'run',
        positionals: [parsed.command, ...parsed.positionals],
    };
}
export { runCli };
//# sourceMappingURL=index.js.map