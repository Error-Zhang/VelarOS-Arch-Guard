import { loadConfig } from '../../config/loadConfig'
import { resolveBaselinePath, runArchGuard } from '../../core/runner'
import { githubReporter } from '../../reporters/github'
import { jsonReporter } from '../../reporters/json'
import { sarifReporter } from '../../reporters/sarif'
import { stylishReporter } from '../../reporters/stylish'
import type { Reporter } from '../../reporters/types'
import { type ParsedArgs, resolveCliFix, toBoolean, toString, toStringArray } from '../argv'
import { applyCliFileScope, describeEmptyFileScope } from '../fileScope'

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
 *   --fail-on-stale           基线里有已修好却没退役的条目时判失败
 *   --log-level error|warn|info|debug
 *
 * **`run` 不写 baseline**。0.2.x 时它默认 `pruneStaleBaseline: true`——跑一次报告就把指纹失配的
 * 冻结条目删掉并回写，于是「跑完就绿、`git checkout` 基线又红」的假绿会常态化，而且消费方把
 * `run` 接进全链质量门时，等于门自己在改棘轮。收缩基线现在只有一个显式入口：
 * `arch-guard baseline prune`。`--no-prune-stale-baseline` 仍可传，但已是空操作。
 */
async function runCommand(args: ParsedArgs): Promise<number> {
  const config = await loadConfig({
    configPath: toString(args.options.config),
    rootDir: toString(args.options.root),
  })
  const fileScope = applyCliFileScope(config, args)

  const reporters = buildReporters(args)

  const result = await runArchGuard({
    config: fileScope.config,
    filter: {
      only: toStringArray(args.options.only),
      skip: toStringArray(args.options.skip),
      tags: toStringArray(args.options.tag),
    },
    reporters,
    logLevel:
      (toString(args.options['log-level']) as 'error' | 'warn' | 'info' | 'debug') ?? 'warn',
    ignoreBaseline: toBoolean(args.options['no-baseline']),
    baselinePath: toString(args.options['baseline-path']) ?? resolveBaselinePath(config.rootDir),
    warnStaleBaseline: !toBoolean(args.options['no-warn-stale-baseline']),
    failOnStale: toBoolean(args.options['fail-on-stale']),
    fix: resolveCliFix(args),
    fileScopeActive: fileScope.active,
  })

  // 「扫了零个文件」不许长得像「扫完了没问题」。放在报告之后打，紧挨着结论。
  // 不短路运行：不读文件扫描面的 check 照样有话说，跳过它们才是把门放松。
  //
  // 走 **stderr**：`--format json` / `--format sarif` 不带 `--out` 时把报告写进 stdout，
  // 往那条流里插一行人话会让产物 JSON.parse 不过。诊断归 stderr，报告归 stdout。
  const emptyScope = describeEmptyFileScope(fileScope)
  if (emptyScope !== undefined) {
    console.error(
      `arch-guard: ${emptyScope} — no file was scanned. Anything reported came from checks that ` +
        'ignore the file scan surface.'
    )
  }
  return result.exitCode
}

function buildReporters(args: ParsedArgs): Reporter[] {
  const formats = toStringArray(args.options.format)
  if (formats.length === 0) return [stylishReporter]
  const out = toString(args.options.out)
  const result: Reporter[] = []
  for (const format of formats) {
    const fmt = format.toLowerCase()
    if (fmt === 'stylish') result.push(stylishReporter)
    else if (fmt === 'json') result.push(jsonReporter({ ...(out ? { out } : {}) }))
    else if (fmt === 'sarif') result.push(sarifReporter({ ...(out ? { out } : {}) }))
    else if (fmt === 'github') result.push(githubReporter)
    else throw new Error(`arch-guard: unrecognized --format "${format}".`)
  }
  return result
}

export { runCommand }
