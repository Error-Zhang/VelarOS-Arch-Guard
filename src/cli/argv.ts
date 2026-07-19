interface ParsedArgs {
  command: string
  positionals: string[]
  options: Record<string, string | boolean | string[]>
}

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
function parseArgs(argv: readonly string[]): ParsedArgs {
  let command = 'run'
  const positionals: string[] = []
  const options: Record<string, string | boolean | string[]> = {}

  function setOption(key: string, value: string | boolean) {
    const existing = options[key]
    if (existing === undefined) {
      options[key] = value
      return
    }
    if (typeof existing === 'boolean') {
      options[key] = value
      return
    }
    if (Array.isArray(existing)) {
      if (typeof value === 'string') existing.push(value)
      return
    }
    if (typeof value === 'string') {
      options[key] = [existing, value]
    }
  }

  let i = 0
  let consumedCommand = false
  while (i < argv.length) {
    const token = argv[i]
    if (token === undefined) break
    if (token.startsWith('--')) {
      const equalsIndex = token.indexOf('=')
      if (equalsIndex !== -1) {
        const key = token.slice(2, equalsIndex)
        const value = token.slice(equalsIndex + 1)
        setOption(key, value)
        i += 1
        continue
      }
      const key = token.slice(2)
      const next = argv[i + 1]
      if (next !== undefined && !next.startsWith('--')) {
        setOption(key, next)
        i += 2
        continue
      }
      setOption(key, true)
      i += 1
      continue
    }
    if (!consumedCommand) {
      command = token
      consumedCommand = true
    } else {
      positionals.push(token)
    }
    i += 1
  }

  return { command, positionals, options }
}

function toStringArray(value: string | boolean | string[] | undefined): string[] {
  if (value === undefined || typeof value === 'boolean') return []
  return Array.isArray(value) ? value : [value]
}

function toBoolean(value: string | boolean | string[] | undefined): boolean {
  return value === true || value === 'true'
}

function toString(value: string | boolean | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value
  return undefined
}

function toOptionalFixFlag(value: string | boolean | string[] | undefined): boolean | undefined {
  if (value === true || value === 'true') return true
  if (value === false || value === 'false') return false
  return undefined
}

/**
 * CLI：`--no-fix` 优先于 `--fix`；均未传时返回 `undefined`（沿用配置文件 `fix`）。
 */
function resolveCliFix(args: ParsedArgs): boolean | undefined {
  if (toBoolean(args.options['no-fix'])) return false
  const explicit = toOptionalFixFlag(args.options.fix)
  if (explicit !== undefined) return explicit
  return undefined
}

export { parseArgs, resolveCliFix, toBoolean, toString, toStringArray }
export type { ParsedArgs }
