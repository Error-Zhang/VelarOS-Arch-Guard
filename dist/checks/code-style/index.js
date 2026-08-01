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
const codeStyleChecks = [
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
];
/**
 * 生成 plugin `defaults`：把公共扫描面扇出到全部 `code-style/*` 规则。
 *
 * 消费方只需声明一次目录坐标，无须给 37 条规则逐条重复；单条规则的专属选项走 `perCheck`。
 */
function createCodeStyleDefaults(input = {}) {
    const shared = { ...compactScope(input.scope ?? {}), ...compactHelpers(input.helpers ?? {}) };
    const defaults = {};
    for (const check of codeStyleChecks) {
        defaults[check.id] = { ...shared, ...(input.perCheck?.[check.id] ?? {}) };
    }
    for (const [id, options] of Object.entries(input.perCheck ?? {})) {
        if (defaults[id])
            continue;
        defaults[id] = { ...shared, ...options };
    }
    return defaults;
}
function compactHelpers(helpers) {
    const result = {};
    if (typeof helpers.module === 'string' && helpers.module.length > 0) {
        result.helperImportModule = helpers.module;
    }
    if (helpers.bySymbol && Object.keys(helpers.bySymbol).length > 0) {
        result.helperImportModuleBySymbol = helpers.bySymbol;
    }
    if (helpers.assumeGlobals === true) {
        result.helperAssumeGlobals = true;
    }
    return result;
}
function compactScope(scope) {
    const entries = Object.entries(scope).filter(([, value]) => Array.isArray(value) && value.length > 0);
    return Object.fromEntries(entries);
}
export { codeStyleChecks, createCodeStyleDefaults, forbidClassNameJoinArrays, forbidConsole, forbidDoubleAsAny, forbidDoubleCastBridge, forbidExplicitUndefinedUnion, forbidFieldRemap, forbidNullishChurn, forbidRawRuntimeTypeGuards, forbidRawTimers, forbidRedundantElse, forbidRedundantIsNullAfterObjectGuard, forbidRedundantStrictLiteralComparison, forbidSinglePropertyConditionalSpread, forbidSwallowedErrors, forbidTrivialFunctionWrapper, forbidUndefinedCoalescing, forbidUselessConditional, preferBooleanDataAttributes, preferBooleanLiteralGuards, preferConditionalJsxAnd, preferDoubleBangOverNullishFalse, preferEarlyReturn, preferEmptinessHelpers, preferIsFiniteNumberGuard, preferIsNonBlankStringGuard, preferIsPlainObjectOverGuardedRecordCast, preferIsPlainObjectOverObjectArrayGuard, preferIsPresentLooseNullish, preferJsonStringifyPretty, preferLooseOptional, preferMeaningfulUseMemo, preferNumberOrNullTernary, preferOptionalWhenOverConditionalUndefined, preferSemanticGuardHelpers, preferTableBranching, preferTrimmedStringOrEmptyTernary, requireChineseComments, requireErrorLogging, };
// —— 规则集作者工具箱：项目自有的 code-style 规则可直接复用这批共享件 ——
export { collectChineseTextFiles, collectCodeStyleFiles, columnOf, DefaultSkipPatterns, enclosingConditionalIfDirectCondition, getCachedSourceFile, isFrontendFile, lineOf, readCodeStyleScope, snippetOf, toRelative, unwrapParensExpression, walk, } from './_shared.js';
export { fixReplaceSpan, HelperPrimitiveNames, helpersIntroducedBy, NoHelperImports, readHelperImportSources, resolveHelperImport, } from './_fix.js';
export { CodeStyleFixPhase } from './fixPhases.js';
//# sourceMappingURL=index.js.map