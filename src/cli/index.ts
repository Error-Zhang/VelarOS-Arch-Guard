import { baselineCommand } from './commands/baseline'
import { doctorCommand } from './commands/doctor'
import { explainCommand } from './commands/explain'
import { initCommand } from './commands/init'
import { listCommand } from './commands/list'
import { runCommand } from './commands/run'
import { verifyCommand } from './commands/verify'
import { parseArgs, type ParsedArgs, toBoolean } from './argv'

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
])

const Help = `arch-guard <command> [files...] [options]

Commands:
  run                          Run all checks (default). Full violation output.
  verify                       Run and print one-line summary only. CI / AI agent friendly.
  list                         List all registered checks (supports --by-tag / --json / --ids-only).
  explain <check-id>           Show details for a single check.
  baseline update|check        Manage baseline snapshot.
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
  --no-prune-stale-baseline    Keep stale baseline entries during run.
  --fix                        Apply supported auto-fixes after checks (overrides config fix flag).
  --no-fix                     Disable auto-fix (overrides config when fix is enabled).
  --log-level <error|warn|info|debug>
  --json                       (verify / list) Emit machine-readable JSON output.
  --by-tag                     (list) Group checks by tag instead of listing each one.
  --ids-only                   (list) Emit just the check ids, one per line.
`

/** CLI 入口；返回 exit code 由 bin 启动器消费。 */
async function runCli(argv: readonly string[]): Promise<number> {
  const parsed = normalizeDefaultRunCommand(parseArgs(argv))
  if (toBoolean(parsed.options.help)) {
    console.info(Help)
    return 0
  }

  switch (parsed.command) {
    case 'help':
    case '--help':
    case '-h':
      console.info(Help)
      return 0
    case 'list':
      return listCommand(parsed)
    case 'verify':
      return verifyCommand(parsed)
    case 'explain':
      return explainCommand(parsed)
    case 'baseline':
      return baselineCommand(parsed)
    case 'doctor':
      return doctorCommand(parsed)
    case 'init':
      return initCommand(parsed)
    case 'run':
    default:
      return runCommand(parsed)
  }
}

function normalizeDefaultRunCommand(parsed: ParsedArgs): ParsedArgs {
  if (KnownCommands.has(parsed.command)) return parsed
  return {
    ...parsed,
    command: 'run',
    positionals: [parsed.command, ...parsed.positionals],
  }
}

export { runCli }
