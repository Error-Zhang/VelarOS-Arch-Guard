import { spawnSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { posix, relative, resolve } from 'node:path'

import type { ResolvedConfig } from '../config/types'
import { isAbsoluteLikePath, normalizePathSeparators } from '../utils/paths'

import { type ParsedArgs, toBoolean, toString, toStringArray } from './argv'

interface CliFileScopeResult {
  config: ResolvedConfig
  /** 本次运行是否被收窄到部分文件。 */
  active: boolean
  files: string[]
  /**
   * 用户**是否要求过**文件作用域（`--file` / 裸 positional / `--changed` / `--diff` / `--staged`）。
   *
   * 与 `active` 分开：`--changed` 的 diff 里一个 `.ts/.tsx/.js/.mjs` 都没有时 `files` 为空，
   * 旧实现于是回落成 `active:false`＝**全仓**。读命令因此扫了全仓，写命令（`baseline update`）
   * 更糟——直接走无作用域分支，把整仓当前违规重冻一遍。「我只想动这几个文件」静默变成
   * 「重写整条棘轮」，是这一批要消灭的那类隐式行为里最贵的一个。
   */
  requested: boolean
  /** 要求了作用域，但解析下来一个可扫文件都没有。 */
  empty: boolean
  /** 用户要求作用域时给出的原始实参，用于把「为什么是空的」讲清楚。 */
  requestedInputs: string[]
}

const SupportedFileExtensions = new Set(['.ts', '.tsx', '.js', '.mjs'])
const AllConfiguredRoots = '<arch-guard:all-configured-roots>'

function applyCliFileScope(config: ResolvedConfig, args: ParsedArgs): CliFileScopeResult {
  const requestedInputs = describeRequestedScope(args)
  const requested = requestedInputs.length > 0
  const files = collectCliFileScopeFiles(config.rootDir, args)
  if (files.length === 0) return {
      // 要求过作用域却解析成空：扫描面收成空集，**不是**回落成全仓。
      config: requested ? withEmptyFileScope(config) : config,
      active: requested,
      files: [],
      requested,
      empty: requested,
      requestedInputs,
    }

  const includePatterns = files.flatMap((path) => fileScopePatternsFor(config.rootDir, path))
  const roots = narrowScopeRoots(
    config.files?.roots,
    files.flatMap((path) => fileScopeRootsFor(config.rootDir, path))
  )
  return {
    config: {
      ...config,
      files: {
        ...config.files,
        roots: Object.freeze(roots),
        includePatterns: Object.freeze([
          ...(config.files?.includePatterns ?? []),
          ...includePatterns,
        ]),
      },
    },
    active: true,
    files,
    requested,
    empty: false,
    requestedInputs,
  }
}

/**
 * 空作用域的扫描面：一个不可能存在的 root + 同样不可能的 include pattern。
 *
 * `restrictRoots` 把「roots 为空数组」当成「不限制」，所以不能用空数组表达空集。
 */
const EmptyScopeSentinel = '<arch-guard:empty-file-scope>'

function withEmptyFileScope(config: ResolvedConfig): ResolvedConfig {
  return {
    ...config,
    files: {
      ...config.files,
      roots: Object.freeze([EmptyScopeSentinel]),
      includePatterns: Object.freeze([`${EmptyScopeSentinel}/**`]),
    },
  }
}

/** 用户在命令行上要求过哪些作用域实参（用于空作用域的解释文案）。 */
function describeRequestedScope(args: ParsedArgs): string[] {
  const inputs: string[] = []
  for (const positional of args.positionals) inputs.push(positional)
  for (const file of toStringArray(args.options.file)) inputs.push(`--file ${file}`)
  if (toBoolean(args.options.changed)) inputs.push('--changed')
  if (toBoolean(args.options.diff)) inputs.push('--diff')
  if (toBoolean(args.options.staged)) inputs.push('--staged')
  return inputs
}

function collectCliFileScopeFiles(rootDir: string, args: ParsedArgs): string[] {
  const explicit = [...args.positionals, ...toStringArray(args.options.file)]
  const fromExplicit = explicit.flatMap((entry) => normalizeFileScopeInput(rootDir, entry))
  const wantsChanged = toBoolean(args.options.changed) || toBoolean(args.options.diff)
  const fromChanged = wantsChanged ? collectChangedFiles(rootDir, args) : []
  const fromStaged = toBoolean(args.options.staged) ? collectStagedFiles(rootDir) : []
  return unique([...fromExplicit, ...fromChanged, ...fromStaged]).filter((file) =>
    isSupportedSourcePath(file)
  )
}

function normalizeFileScopeInput(rootDir: string, entry: string): string[] {
  const normalized = normalizeFileScopePath(rootDir, entry)
  if (!normalized) return []
  if (looksLikeGlob(normalized)) return [normalized]

  const absolute = resolve(rootDir, normalized)
  if (!existsSync(absolute)) return [normalized]

  const stats = statSync(absolute)
  if (stats.isDirectory()) return [stripTrailingSlash(normalized)]
  return [normalized]
}

function collectChangedFiles(rootDir: string, args: ParsedArgs): string[] {
  const base = toString(args.options.base)
  if (base) return gitLines(rootDir, ['diff', '--name-only', base, '--'])
  return unique([
    ...collectStagedFiles(rootDir),
    ...gitLines(rootDir, ['diff', '--name-only', '--']),
    ...gitLines(rootDir, ['ls-files', '--others', '--exclude-standard']),
  ])
}

function collectStagedFiles(rootDir: string): string[] {
  return gitLines(rootDir, ['diff', '--name-only', '--cached', '--'])
}

function gitLines(rootDir: string, args: string[]): string[] {
  const result = spawnSync('git', args, {
    cwd: rootDir,
    encoding: 'utf-8',
  })
  if (result.status !== 0) return []
  return result.stdout
    .split('\n')
    .map((line) => normalizeFileScopePath(rootDir, line))
    .filter(Boolean)
}

function fileScopePatternsFor(rootDir: string, path: string): string[] {
  const normalized = stripTrailingSlash(normalizeFileScopePath(rootDir, path))
  if (!normalized) return []
  if (looksLikeGlob(normalized)) return [normalized]

  const absoluteCandidate = resolve(rootDir, normalized)
  if (existsSync(absoluteCandidate) && statSync(absoluteCandidate).isDirectory()) {
    if (normalized === '.') return ['**/*']
    return [`${normalized}/**`]
  }
  if (!isSupportedSourcePath(normalized) && !normalized.includes('.')) return [`${normalized}/**`]
  return [normalized]
}

function fileScopeRootsFor(rootDir: string, path: string): string[] {
  const normalized = stripTrailingSlash(normalizeFileScopePath(rootDir, path))
  if (!normalized) return []
  if (looksLikeGlob(normalized)) return [staticRootForGlob(normalized)]

  const absoluteCandidate = resolve(rootDir, normalized)
  if (existsSync(absoluteCandidate) && statSync(absoluteCandidate).isDirectory()) {
    if (normalized === '.') return [AllConfiguredRoots]
    return [normalized]
  }
  if (!isSupportedSourcePath(normalized) && !normalized.includes('.')) return [normalized]

  const directory = posix.dirname(normalized)
  return [normalizeScopeRoot(directory)]
}

function narrowScopeRoots(
  configuredRoots: readonly string[] | undefined,
  scopeRoots: readonly string[]
): string[] {
  const configured = normalizeRootList(
    configuredRoots && configuredRoots.length > 0 ? configuredRoots : ['.']
  )
  const scoped = normalizeRootList(scopeRoots)
  const result = new Set<string>()

  for (const scope of scoped) {
    if (scope === AllConfiguredRoots) {
      for (const configuredRoot of configured) {
        result.add(configuredRoot)
      }
      continue
    }
    for (const configuredRoot of configured) {
      if (scope === '.' && configuredRoot !== '.') continue
      if (isPathWithin(scope, configuredRoot)) {
        result.add(scope)
      } else if (isPathWithin(configuredRoot, scope)) {
        result.add(configuredRoot)
      }
    }
  }

  return [...result]
}

function isSupportedSourcePath(path: string): boolean {
  if (looksLikeGlob(path)) return true
  if (!path.includes('.')) return true
  return [...SupportedFileExtensions].some((extension) => path.endsWith(extension))
}

function normalizeFileScopePath(rootDir: string, path: string): string {
  const trimmed = path.trim()
  if (!trimmed) return ''

  const normalized = trimmed.replaceAll('\\', '/').replace(/^\.\/+/, '')
  if (normalized === '.') return '.'
  if (looksLikeGlob(normalized)) return stripTrailingSlash(normalized)

  const absolutePath = isAbsoluteLikePath(trimmed) ? trimmed : resolve(rootDir, trimmed)
  return normalizePathSeparators(relative(rootDir, absolutePath)).replace(/^\.\/+/, '')
}

function normalizeRootList(roots: readonly string[]): string[] {
  return unique(roots.map(normalizeScopeRoot))
}

function normalizeScopeRoot(root: string): string {
  const normalized = stripTrailingSlash(root.replaceAll('\\', '/').replace(/^\.\/+/, ''))
  return normalized || '.'
}

function staticRootForGlob(path: string): string {
  const segments = path.split('/')
  const firstGlobIndex = segments.findIndex((segment) => looksLikeGlob(segment))
  const stableSegments = firstGlobIndex === -1 ? segments : segments.slice(0, firstGlobIndex)
  const root = normalizeScopeRoot(stableSegments.join('/'))
  return root === '.' ? AllConfiguredRoots : root
}

function isPathWithin(candidate: string, parent: string): boolean {
  if (parent === '.') return true
  return candidate === parent || candidate.startsWith(`${parent}/`)
}

function stripTrailingSlash(path: string): string {
  return path.replace(/\/+$/, '')
}

function looksLikeGlob(path: string): boolean {
  return /[*?[\]{}]/.test(path)
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

/**
 * 「要求了作用域，但一个可扫文件都没有」的一句话说明；不是这种情况时返回 `undefined`。
 *
 * **写**命令拿它当拒绝理由：什么都不做，基线一个字节不碰。
 * **读**命令（`run` / `verify` / `baseline check`）拿它当告示——「扫了零个文件」和
 * 「扫完了没问题」必须可分辨，否则 `verify --changed` 在一个只改了 .md 的分支上打出
 * `PASS`，读的人有充分理由以为代码被检查过了。
 *
 * 读命令**不因此短路**：不读文件扫描面的 check（docs 索引、package.json 契约、i18n、
 * 遗留 .mjs 巨石）照样报全量违规，跳过它们等于让门变松。告示只加信息，不改判定。
 */
function describeEmptyFileScope(scope: CliFileScopeResult): string | undefined {
  if (!scope.empty) return undefined
  return (
    `${scope.requestedInputs.join(' ')} resolved to 0 scannable files ` +
    '(arch-guard only reads .ts/.tsx/.js/.mjs)'
  )
}

export { applyCliFileScope, describeEmptyFileScope }
export type { CliFileScopeResult }
