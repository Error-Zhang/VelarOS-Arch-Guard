import type { Check } from '../../core/defineCheck'

import { forbidClassNameJoinArrays } from './forbidClassNameJoinArrays'
import { forbidConsole } from './forbidConsole'
import { forbidDoubleAsAny } from './forbidDoubleAsAny'
import { forbidDoubleCastBridge } from './forbidDoubleCastBridge'
import { forbidExplicitUndefinedUnion } from './forbidExplicitUndefinedUnion'
import { forbidFieldRemap } from './forbidFieldRemap'
import { forbidNullishChurn } from './forbidNullishChurn'
import { forbidRawRuntimeTypeGuards } from './forbidRawRuntimeTypeGuards'
import { forbidRawTimers } from './forbidRawTimers'
import { forbidRedundantElse } from './forbidRedundantElse'
import { forbidRedundantIsNullAfterObjectGuard } from './forbidRedundantIsNullAfterObjectGuard'
import { forbidRedundantStrictLiteralComparison } from './forbidRedundantStrictLiteralComparison'
import { forbidSinglePropertyConditionalSpread } from './forbidSinglePropertyConditionalSpread'
import { forbidSwallowedErrors } from './forbidSwallowedErrors'
import { forbidTrivialFunctionWrapper } from './forbidTrivialFunctionWrapper'
import { forbidUndefinedCoalescing } from './forbidUndefinedCoalescing'
import { forbidUselessConditional } from './forbidUselessConditional'
import { preferBooleanDataAttributes } from './preferBooleanDataAttributes'
import { preferBooleanLiteralGuards } from './preferBooleanLiteralGuards'
import { preferConditionalJsxAnd } from './preferConditionalJsxAnd'
import { preferDoubleBangOverNullishFalse } from './preferDoubleBangOverNullishFalse'
import { preferEarlyReturn } from './preferEarlyReturn'
import { preferEmptinessHelpers } from './preferEmptinessHelpers'
import { preferIsFiniteNumberGuard } from './preferIsFiniteNumberGuard'
import { preferIsNonBlankStringGuard } from './preferIsNonBlankStringGuard'
import { preferIsPlainObjectOverGuardedRecordCast } from './preferIsPlainObjectOverGuardedRecordCast'
import { preferIsPlainObjectOverObjectArrayGuard } from './preferIsPlainObjectOverObjectArrayGuard'
import { preferIsPresentLooseNullish } from './preferIsPresentLooseNullish'
import { preferJsonStringifyPretty } from './preferJsonStringifyPretty'
import { preferLooseOptional } from './preferLooseOptional'
import { preferMeaningfulUseMemo } from './preferMeaningfulUseMemo'
import { preferNumberOrNullTernary } from './preferNumberOrNullTernary'
import { preferOptionalWhenOverConditionalUndefined } from './preferOptionalWhenOverConditionalUndefined'
import { preferSemanticGuardHelpers } from './preferSemanticGuardHelpers'
import { preferTableBranching } from './preferTableBranching'
import { preferTrimmedStringOrEmptyTernary } from './preferTrimmedStringOrEmptyTernary'
import { requireChineseComments } from './requireChineseComments'
import { requireErrorLogging } from './requireErrorLogging'

/**
 * 语言级写法规则集（`code-style/*`）。
 *
 * 这一族的判据只认识 TypeScript / JavaScript 语言构件与一套**可配置的 helper 词表**，
 * 与任何具体产品的架构无关；识别产品概念（包边界、进程边界、领域词表）的规则属于各项目
 * 自己的 plugin，不进本包。
 *
 * 每条规则独立注册：可单独关闭、降级、屏蔽，基线条目也互不影响。
 * 扫描面由 check options 注入（见 {@link createCodeStyleDefaults}），本包不硬编码任何目录名。
 */
const codeStyleChecks: readonly Check[] = [
  forbidConsole,
  forbidRawTimers,
  forbidNullishChurn,
  forbidDoubleCastBridge,
  forbidUndefinedCoalescing,
  forbidExplicitUndefinedUnion,
  forbidSwallowedErrors,
  preferOptionalWhenOverConditionalUndefined,
  preferDoubleBangOverNullishFalse,
  forbidRawRuntimeTypeGuards,
  preferIsPresentLooseNullish,
  forbidRedundantIsNullAfterObjectGuard,
  preferJsonStringifyPretty,
  preferIsPlainObjectOverGuardedRecordCast,
  preferIsPlainObjectOverObjectArrayGuard,
  preferIsFiniteNumberGuard,
  preferIsNonBlankStringGuard,
  preferTrimmedStringOrEmptyTernary,
  preferNumberOrNullTernary,
  forbidRedundantStrictLiteralComparison,
  preferLooseOptional,
  forbidClassNameJoinArrays,
  preferTableBranching,
  preferEmptinessHelpers,
  preferSemanticGuardHelpers,
  preferBooleanLiteralGuards,
  preferBooleanDataAttributes,
  preferConditionalJsxAnd,
  requireErrorLogging,
  forbidFieldRemap,
  forbidTrivialFunctionWrapper,
  forbidSinglePropertyConditionalSpread,
  preferMeaningfulUseMemo,
  requireChineseComments,
  forbidRedundantElse,
  forbidUselessConditional,
  preferEarlyReturn,
]

/** 全规则集共用的扫描面选项。缺项即「不过滤」，交给配置的 `files` 作用域收窄。 */
interface CodeStyleScopeOptions {
  /** 收集起点（相对 rootDir），默认 `['.']`。 */
  scanRoots?: readonly string[]
  /** 被视为运行时业务代码的根；多数规则只扫这里。 */
  runtimeRoots?: readonly string[]
  /** 前端 / 渲染层根；JSX 类规则只扫这里。 */
  frontendRoots?: readonly string[]
  /** 整体豁免的便携库前缀（如工具包自身）。 */
  portableLibraryPrefixes?: readonly string[]
  /** 追加跳过 pattern（正则源串）。 */
  skipPatterns?: readonly string[]
}

interface CreateCodeStyleDefaultsInput {
  /** 扇出到每条 code-style 规则的公共扫描面。 */
  scope?: CodeStyleScopeOptions
  /** 按 check id 追加的单条选项（如 `allowFiles`），与公共项浅合并。 */
  perCheck?: Readonly<Record<string, Readonly<Record<string, unknown>>>>
}

/**
 * 生成 plugin `defaults`：把公共扫描面扇出到全部 `code-style/*` 规则。
 *
 * 消费方只需声明一次目录坐标，无须给 37 条规则逐条重复；单条规则的专属选项走 `perCheck`。
 */
function createCodeStyleDefaults(
  input: CreateCodeStyleDefaultsInput = {}
): Record<string, Record<string, unknown>> {
  const scope = compactScope(input.scope ?? {})
  const defaults: Record<string, Record<string, unknown>> = {}
  for (const check of codeStyleChecks) {
    defaults[check.id] = { ...scope, ...(input.perCheck?.[check.id] ?? {}) }
  }
  for (const [id, options] of Object.entries(input.perCheck ?? {})) {
    if (defaults[id]) continue
    defaults[id] = { ...scope, ...options }
  }
  return defaults
}

function compactScope(scope: CodeStyleScopeOptions): Record<string, unknown> {
  const entries = Object.entries(scope).filter(
    ([, value]) => Array.isArray(value) && value.length > 0
  )
  return Object.fromEntries(entries)
}

export {
  codeStyleChecks,
  createCodeStyleDefaults,
  forbidClassNameJoinArrays,
  forbidConsole,
  forbidDoubleAsAny,
  forbidDoubleCastBridge,
  forbidExplicitUndefinedUnion,
  forbidFieldRemap,
  forbidNullishChurn,
  forbidRawRuntimeTypeGuards,
  forbidRawTimers,
  forbidRedundantElse,
  forbidRedundantIsNullAfterObjectGuard,
  forbidRedundantStrictLiteralComparison,
  forbidSinglePropertyConditionalSpread,
  forbidSwallowedErrors,
  forbidTrivialFunctionWrapper,
  forbidUndefinedCoalescing,
  forbidUselessConditional,
  preferBooleanDataAttributes,
  preferBooleanLiteralGuards,
  preferConditionalJsxAnd,
  preferDoubleBangOverNullishFalse,
  preferEarlyReturn,
  preferEmptinessHelpers,
  preferIsFiniteNumberGuard,
  preferIsNonBlankStringGuard,
  preferIsPlainObjectOverGuardedRecordCast,
  preferIsPlainObjectOverObjectArrayGuard,
  preferIsPresentLooseNullish,
  preferJsonStringifyPretty,
  preferLooseOptional,
  preferMeaningfulUseMemo,
  preferNumberOrNullTernary,
  preferOptionalWhenOverConditionalUndefined,
  preferSemanticGuardHelpers,
  preferTableBranching,
  preferTrimmedStringOrEmptyTernary,
  requireChineseComments,
  requireErrorLogging,
}
export type { CodeStyleScopeOptions, CreateCodeStyleDefaultsInput }

// —— 规则集作者工具箱：项目自有的 code-style 规则可直接复用这批共享件 ——
export {
  collectChineseTextFiles,
  collectCodeStyleFiles,
  columnOf,
  DefaultSkipPatterns,
  enclosingConditionalIfDirectCondition,
  getCachedSourceFile,
  isFrontendFile,
  lineOf,
  readCodeStyleScope,
  snippetOf,
  toRelative,
  unwrapParensExpression,
  walk,
} from './_shared'
export type { CodeStyleScope, CollectCodeStyleFilesOptions, SourceFileInfo } from './_shared'
export { CodeStyleFixPhase } from './fixPhases'
