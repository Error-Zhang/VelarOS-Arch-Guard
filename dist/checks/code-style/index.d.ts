import type { Check } from '../../core/defineCheck.js';
import { forbidClassNameJoinArrays } from './forbidClassNameJoinArrays.js';
import { forbidConsole } from './forbidConsole.js';
import { forbidDoubleAsAny } from './forbidDoubleAsAny.js';
import { forbidDoubleCastBridge } from './forbidDoubleCastBridge.js';
import { forbidExplicitUndefinedUnion } from './forbidExplicitUndefinedUnion.js';
import { forbidFieldRemap } from './forbidFieldRemap.js';
import { forbidNullishChurn } from './forbidNullishChurn.js';
import { forbidRawRuntimeTypeGuards } from './forbidRawRuntimeTypeGuards.js';
import { forbidRawTimers } from './forbidRawTimers.js';
import { forbidRedundantElse } from './forbidRedundantElse.js';
import { forbidRedundantIsNullAfterObjectGuard } from './forbidRedundantIsNullAfterObjectGuard.js';
import { forbidRedundantStrictLiteralComparison } from './forbidRedundantStrictLiteralComparison.js';
import { forbidSinglePropertyConditionalSpread } from './forbidSinglePropertyConditionalSpread.js';
import { forbidSwallowedErrors } from './forbidSwallowedErrors.js';
import { forbidTrivialFunctionWrapper } from './forbidTrivialFunctionWrapper.js';
import { forbidUndefinedCoalescing } from './forbidUndefinedCoalescing.js';
import { forbidUselessConditional } from './forbidUselessConditional.js';
import { preferBooleanDataAttributes } from './preferBooleanDataAttributes.js';
import { preferBooleanLiteralGuards } from './preferBooleanLiteralGuards.js';
import { preferConditionalJsxAnd } from './preferConditionalJsxAnd.js';
import { preferDoubleBangOverNullishFalse } from './preferDoubleBangOverNullishFalse.js';
import { preferEarlyReturn } from './preferEarlyReturn.js';
import { preferEmptinessHelpers } from './preferEmptinessHelpers.js';
import { preferIsFiniteNumberGuard } from './preferIsFiniteNumberGuard.js';
import { preferIsNonBlankStringGuard } from './preferIsNonBlankStringGuard.js';
import { preferIsPlainObjectOverGuardedRecordCast } from './preferIsPlainObjectOverGuardedRecordCast.js';
import { preferIsPlainObjectOverObjectArrayGuard } from './preferIsPlainObjectOverObjectArrayGuard.js';
import { preferIsPresentLooseNullish } from './preferIsPresentLooseNullish.js';
import { preferJsonStringifyPretty } from './preferJsonStringifyPretty.js';
import { preferLooseOptional } from './preferLooseOptional.js';
import { preferMeaningfulUseMemo } from './preferMeaningfulUseMemo.js';
import { preferNumberOrNullTernary } from './preferNumberOrNullTernary.js';
import { preferOptionalWhenOverConditionalUndefined } from './preferOptionalWhenOverConditionalUndefined.js';
import { preferSemanticGuardHelpers } from './preferSemanticGuardHelpers.js';
import { preferTableBranching } from './preferTableBranching.js';
import { preferTrimmedStringOrEmptyTernary } from './preferTrimmedStringOrEmptyTernary.js';
import { requireChineseComments } from './requireChineseComments.js';
import { requireErrorLogging } from './requireErrorLogging.js';
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
declare const codeStyleChecks: readonly Check[];
/** 全规则集共用的扫描面选项。缺项即「不过滤」，交给配置的 `files` 作用域收窄。 */
interface CodeStyleScopeOptions {
    /** 收集起点（相对 rootDir），默认 `['.']`。 */
    scanRoots?: readonly string[];
    /** 被视为运行时业务代码的根；多数规则只扫这里。 */
    runtimeRoots?: readonly string[];
    /** 前端 / 渲染层根；JSX 类规则只扫这里。 */
    frontendRoots?: readonly string[];
    /** 整体豁免的便携库前缀（如工具包自身）。 */
    portableLibraryPrefixes?: readonly string[];
    /** 追加跳过 pattern（正则源串）。 */
    skipPatterns?: readonly string[];
}
/**
 * autofix 引入的原语（`isString` / `isEmpty` / `optionalWhen` …）从哪里 import。
 *
 * **不声明就不 autofix**：这一族有 15 条规则会吐出具名原语，补不上 import 的话改完的文件会
 * 同时爆 `TS2304`（找不到名字）与 `TS2322`（未解析的标识符不携带类型谓词，原本靠裸 `typeof`
 * 完成的窄化整体塌掉），报错数比缺失的 import 还多。所以没有来源时这些修复会被**拒绝并报出**，
 * 而不是默默写出不编译的代码。宿主真把原语注入成全局时用 `assumeGlobals: true` 明说。
 */
interface CodeStyleHelperOptions {
    /** 默认来源模块，如 `'@velaros-ai/core'`。 */
    module?: string;
    /** 个别原语的来源覆盖，如 `{ stringifyPretty: '@my/json' }`。 */
    bySymbol?: Readonly<Record<string, string>>;
    /** 这些原语全局可见（宿主注入）：不补 import，也不因此拒绝修复。 */
    assumeGlobals?: boolean;
}
interface CreateCodeStyleDefaultsInput {
    /** 扇出到每条 code-style 规则的公共扫描面。 */
    scope?: CodeStyleScopeOptions;
    /** autofix 引入的原语来源（见 {@link CodeStyleHelperOptions}）。 */
    helpers?: CodeStyleHelperOptions;
    /** 按 check id 追加的单条选项（如 `allowFiles`），与公共项浅合并。 */
    perCheck?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}
/**
 * 生成 plugin `defaults`：把公共扫描面扇出到全部 `code-style/*` 规则。
 *
 * 消费方只需声明一次目录坐标，无须给 37 条规则逐条重复；单条规则的专属选项走 `perCheck`。
 */
declare function createCodeStyleDefaults(input?: CreateCodeStyleDefaultsInput): Record<string, Record<string, unknown>>;
export { codeStyleChecks, createCodeStyleDefaults, forbidClassNameJoinArrays, forbidConsole, forbidDoubleAsAny, forbidDoubleCastBridge, forbidExplicitUndefinedUnion, forbidFieldRemap, forbidNullishChurn, forbidRawRuntimeTypeGuards, forbidRawTimers, forbidRedundantElse, forbidRedundantIsNullAfterObjectGuard, forbidRedundantStrictLiteralComparison, forbidSinglePropertyConditionalSpread, forbidSwallowedErrors, forbidTrivialFunctionWrapper, forbidUndefinedCoalescing, forbidUselessConditional, preferBooleanDataAttributes, preferBooleanLiteralGuards, preferConditionalJsxAnd, preferDoubleBangOverNullishFalse, preferEarlyReturn, preferEmptinessHelpers, preferIsFiniteNumberGuard, preferIsNonBlankStringGuard, preferIsPlainObjectOverGuardedRecordCast, preferIsPlainObjectOverObjectArrayGuard, preferIsPresentLooseNullish, preferJsonStringifyPretty, preferLooseOptional, preferMeaningfulUseMemo, preferNumberOrNullTernary, preferOptionalWhenOverConditionalUndefined, preferSemanticGuardHelpers, preferTableBranching, preferTrimmedStringOrEmptyTernary, requireChineseComments, requireErrorLogging, };
export type { CodeStyleHelperOptions, CodeStyleScopeOptions, CreateCodeStyleDefaultsInput, };
export { collectChineseTextFiles, collectCodeStyleFiles, columnOf, DefaultSkipPatterns, enclosingConditionalIfDirectCondition, getCachedSourceFile, isFrontendFile, lineOf, readCodeStyleScope, snippetOf, toRelative, unwrapParensExpression, walk, } from './_shared.js';
export type { CodeStyleScope, CollectCodeStyleFilesOptions, SourceFileInfo } from './_shared.js';
export { fixReplaceSpan, HelperPrimitiveNames, helpersIntroducedBy, NoHelperImports, readHelperImportSources, resolveHelperImport, } from './_fix.js';
export type { HelperImportResolution, HelperImportSources, ReplaceSpanInput, ScheduledFix } from './_fix.js';
export { CodeStyleFixPhase } from './fixPhases.js';
//# sourceMappingURL=index.d.ts.map