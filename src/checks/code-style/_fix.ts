import type { CheckRunContext } from '../../core/defineCheck'
import type { FixContext } from '../../core/fixContext'

/**
 * code-style 修复器的共享落点。
 *
 * 这一族规则原本各自持有一份逐字节相同的 `fixReplaceText` / `fixReplaceRange`，且**都只改表达式、
 * 不管 import**。19 条可 autofix 的规则里有 15 条会吐出 `isString` / `isEmpty` / `optionalWhen`
 * 这类具名原语，`--fix` 之后文件里并没有这些名字，于是 `TS2304` 叠加 `TS2322`（未解析标识符不
 * 携带类型谓词，窄化整体塌掉）。这里把替换和「补 import」并成同一个动作，规则只需说明
 * 「我引入了哪些名字」——由 {@link HelperPrimitiveNames} 从替换文本里机械识别。
 */

/** 这一族规则可能吐出的原语。补 import 时只认这张表，避免误伤用户标识符。 */
const HelperPrimitiveNames: readonly string[] = [
  'isArray',
  'isBigInt',
  'isBlank',
  'isBoolean',
  'isEmpty',
  'isFalse',
  'isFiniteNumber',
  'isFunction',
  'isNonBlankString',
  'isNonEmptyArray',
  'isNotNull',
  'isNotUndefined',
  'isNull',
  'isNumber',
  'isObject',
  'isPlainObject',
  'isPositiveNumber',
  'isPresent',
  'isRecord',
  'isString',
  'isSymbol',
  'isTrue',
  'isUndefined',
  'numberOrNull',
  'optionalWhen',
  'stringifyPretty',
  'toNullable',
  'toOptional',
  'trimmedStringOrEmpty',
]

/**
 * 原语的导入来源。
 *
 * 由 check options 注入（`helperImportModule` / `helperImportModuleBySymbol`）：这些原语住哪个包
 * 是**消费方**的事，规则集不认识任何具体包名。
 *
 * **没配来源时不再默默改盘**。0.3.0 的第一版把「没配 = 不补 import」当成向后兼容，结果是两个
 * 消费仓都没配（升级步骤里也没提这一步），于是 `--fix` 一次引入几百个未解析标识符、什么都不打印。
 * 静默写出不编译的代码是最坏的一档；宿主真的把这些原语注入成全局时用
 * `helpers: { assumeGlobals: true }` 明说。
 */
interface HelperImportSources {
  module: string
  bySymbol: Readonly<Record<string, string>>
  /** 宿主声明这些原语是全局可见的：不补 import，也不因此拒绝修复。 */
  assumeGlobals: boolean
}

const NoHelperImports: HelperImportSources = { module: '', bySymbol: {}, assumeGlobals: false }

/** 从 check options 读出原语来源。 */
function readHelperImportSources(context: CheckRunContext): HelperImportSources {
  const module = context.options.helperImportModule
  const bySymbol = context.options.helperImportModuleBySymbol
  return {
    module: typeof module === 'string' ? module : '',
    bySymbol:
      typeof bySymbol === 'object' && bySymbol !== null
        ? (Object.fromEntries(
            Object.entries(bySymbol as Record<string, unknown>).filter(
              ([, value]) => typeof value === 'string'
            )
          ) as Record<string, string>)
        : {},
    assumeGlobals: context.options.helperAssumeGlobals === true,
  }
}

/** 单个原语的来源模块；没有配置时返回空串。 */
function moduleForHelper(sources: HelperImportSources, name: string): string {
  return sources.bySymbol[name] ?? sources.module
}

/** 某个原语这次该怎么处理 import。 */
type HelperImportResolution =
  | { kind: 'globals' }
  | { kind: 'module'; module: string }
  | { kind: 'unconfigured' }

function resolveHelperImport(
  sources: HelperImportSources,
  name: string
): HelperImportResolution {
  if (sources.assumeGlobals) return { kind: 'globals' }
  const module = moduleForHelper(sources, name)
  if (module) return { kind: 'module', module }
  return { kind: 'unconfigured' }
}

/**
 * 从替换文本里识别本次引入的原语。
 *
 * 只认「作为被调用者出现」的形态（`name(`），并排除成员访问（`x.isEmpty(`），
 * 避免把用户自己的方法名当成原语。
 */
const HelperCallPatterns: ReadonlyArray<readonly [string, RegExp]> = HelperPrimitiveNames.map(
  (name) => [name, new RegExp(`(?<![.?\\w$])${name}\\s*\\(`)] as const
)

function helpersIntroducedBy(replacement: string): string[] {
  const found: string[] = []
  for (const [name, pattern] of HelperCallPatterns) {
    if (pattern.test(replacement)) found.push(name)
  }
  return found
}

/** 排给引擎的一次修复：替换 + 需要补的 import。 */
interface ScheduledFix {
  applyFix: (ctx: FixContext) => void
  fixStartOffset: number
}

interface ReplaceSpanInput {
  relativePath: string
  start: number
  end: number
  replacement: string
  helpers: HelperImportSources
  /**
   * true 时走 {@link FixContext.replaceTextRange}（保留区间开头的空白 / 注释 trivia），
   * 用于以 `getFullStart()` 取区间的 fixer。默认 false = 纯切片。
   */
  preserveLeadingTrivia?: boolean
}

/**
 * 生成一次「替换 + 补 import」的修复。
 *
 * **先判后写**：所有要引入的名字都先过一遍 {@link FixContext.planNamedImport}，任何一个
 * 判不了（没配来源 / 那个位置这个名字已经被别的东西绑走了）就整次修复放弃、抛出理由，
 * 文件一个字节都不动。`--fix` 只有两种结局：写出能编译的代码，或者什么都不写并明说。
 *
 * import 不在这里写盘：见 {@link FixContext.requireNamedImport}，由引擎在本轮替换全部落盘后 flush。
 */
function fixReplaceSpan(input: ReplaceSpanInput): ScheduledFix {
  const { relativePath, start, end, replacement, helpers } = input
  return {
    fixStartOffset: start,
    applyFix: (ctx: FixContext) => {
      const pending = planHelperImports(ctx, relativePath, start, replacement, helpers)

      if (input.preserveLeadingTrivia === true) {
        ctx.replaceTextRange(relativePath, { start, end }, replacement)
      } else {
        const text = ctx.readTextFile(relativePath)
        ctx.writeTextFile(relativePath, `${text.slice(0, start)}${replacement}${text.slice(end)}`)
      }
      for (const { module, name } of pending) {
        ctx.requireNamedImport(relativePath, module, name)
      }
    },
  }
}

/** 改盘前的体检：算出要补哪些 import，任何一条不确定就抛出，让引擎放弃这次修复。 */
function planHelperImports(
  ctx: FixContext,
  relativePath: string,
  atOffset: number,
  replacement: string,
  helpers: HelperImportSources
): Array<{ module: string; name: string }> {
  const pending: Array<{ module: string; name: string }> = []
  for (const name of helpersIntroducedBy(replacement)) {
    const resolved = resolveHelperImport(helpers, name)
    if (resolved.kind === 'globals') continue
    if (resolved.kind === 'unconfigured') {
      throw new Error(
        `the repair introduces \`${name}\` but this ruleset has no import source for it. ` +
          "Set `createCodeStyleDefaults({ helpers: { module: '@your/core' } })` (or " +
          '`helpers: { assumeGlobals: true }` if these primitives really are globals here).'
      )
    }
    const plan = ctx.planNamedImport(relativePath, resolved.module, name, atOffset)
    if (plan.kind === 'blocked') throw new Error(plan.reason)
    if (plan.kind === 'insert') pending.push({ module: resolved.module, name })
  }
  return pending
}

export {
  fixReplaceSpan,
  HelperPrimitiveNames,
  helpersIntroducedBy,
  moduleForHelper,
  NoHelperImports,
  readHelperImportSources,
  resolveHelperImport,
}
export type { HelperImportResolution,HelperImportSources, ReplaceSpanInput, ScheduledFix }
