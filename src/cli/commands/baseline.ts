import { loadConfig } from '../../config/loadConfig'
import { writeBaselineFile } from '../../core/baseline'
import { resolveBaselinePath, runArchGuard } from '../../core/runner'
import { stylishReporter } from '../../reporters/stylish'
import { type ParsedArgs,toString } from '../argv'

/**
 * `arch-guard baseline <action>`：
 *
 *   update  — 跑一遍所有 checks，把全部违规写入 baseline 文件。
 *   check   — 仅校验现有 baseline 是否完整匹配（不写盘）。
 */
async function baselineCommand(args: ParsedArgs): Promise<number> {
  const action = args.positionals[0]
  if (action !== 'update' && action !== 'check') {
    console.error('Usage: arch-guard baseline <update|check>')
    return 2
  }

  const config = await loadConfig({
    configPath: toString(args.options.config),
    rootDir: toString(args.options.root),
  })
  const baselinePath = toString(args.options['baseline-path']) ?? resolveBaselinePath(config.rootDir)

  const result = await runArchGuard({
    config,
    reporters: [stylishReporter],
    ignoreBaseline: true,
    baselinePath,
    warnStaleBaseline: false,
    fix: false,
  })

  if (action === 'update') {
    writeBaselineFile(baselinePath, result.aggregate.allViolations)
    console.info(
      `arch-guard: wrote ${result.aggregate.allViolations.length} entries to ${baselinePath}.`
    )
    return 0
  }

  // check 模式：仅在违规数和 baseline 不匹配时失败。
  const aggregate = result.aggregate
  if (aggregate.hasFailures || aggregate.allViolations.length > 0) {
    console.error(
      'arch-guard: baseline check found violations not covered by baseline. Run `arch-guard baseline update`.'
    )
    return 1
  }
  return 0
}

export { baselineCommand }
