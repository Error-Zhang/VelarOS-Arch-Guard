/**
 * {@link ViolationInput.fixPhase} 约定：与引擎 `applyFixes` 批次一致，**数值越小越先**；
 * 同一文件跨阶段会分轮重跑检查并重新解析 AST，同阶段内按源码偏移从大到小应用。
 *
 * 依赖关系靠后的阶段应更大，减少「一轮修完才发现还能再简一步」的抖动（runner 仍会多轮复跑直至稳定）。
 */
const CodeStyleFixPhase = {
  /** `typeof` / `Array.isArray` → `isObject` / `isArray` 等基底改写 */
  rawRuntimeTypeGuards: 0,
  /** **`globalThis.Log`** / **`globalThis.isString`** 等 → 直写 **`Log`** / **`isString`**（全局已注入时） */
  preferBareInjectedGlobals: 5,
  /** **`expr != null`** / **`expr == null`**（宽松）→ **`isPresent`** / **`!isPresent`** */
  preferIsPresentLooseNullish: 6,
  /** presence ternary / IIFE → **`toNullable(x)`** */
  preferToNullableOverIsPresentNullTernary: 7,
  /** `error instanceof Error ? error.message : String(error)` → `AppError.getMessage(error)` */
  preferAppErrorMessage: 7.5,
  /** `JSON.stringify(value, null, 2)` → `JSON.stringifyPretty(value)` */
  preferJsonStringifyPretty: 7.6,
  /** `...(cond ? { field } : {})` → **`field: optionalWhen(cond, value)`** */
  preferToOptionalOverConditionalSpread: 8,
  /** `cond ? value : undefined` → **`optionalWhen(cond, value)`**；`x ? x : undefined` → **`toOptional(x)`** */
  preferOptionalWhenOverConditionalUndefined: 8.5,
  /** `toOptional(x ? x : undefined)` → `toOptional(x)` */
  simplifyToOptionalTruthySelfTernary: 9,
  /** `||` 链上已排除 null 后的冗余 `!isNull` 合取 */
  redundantIsNullAfterObjectGuard: 10,
  /** 缺席类型 contract 统一化 */
  preferLooseOptional: 15,
  /** `isObject(x) && !isArray(x)`（及可吸收的前置 truthy 守卫）→ `isPlainObject(x)` */
  preferIsPlainObject: 20,
  /** `isNumber && Number.isFinite` / `!isNumber || !Number.isFinite`（及等价 `typeof` 手写）→ `isFiniteNumber` / `!isFiniteNumber` */
  preferIsFiniteNumber: 21,
  /** isString(x) / typeof===string + trim 真值 → isNonBlankString(x) */
  preferIsNonBlankString: 22,
  /** isString / typeof===string 三元 `? …trim() : ''` → trimmedStringOrEmpty(x) */
  preferTrimmedStringOrEmpty: 23,
  /** isNumber / typeof===number 三元 `? x : null` → numberOrNull(x) */
  preferNumberOrNull: 24,
  /** `readString(a, 'x') ?? readString(b, 'y')` → `readFirstString(a?.x, b?.y)` */
  preferReadFirstString: 25,
  /** `expr ?? false` → `!!expr` */
  preferDoubleBangOverNullishFalse: 30,
  /** `.length` 与 `0`/`1` 比较 / `!`length / `=== ''` → **`isEmpty(x)`** / **`isBlank(x)`** 具名导出 */
  preferEmptinessHelpers: 35,
  /** `isArray(x) && !x.isEmpty` / `isNumber(x) && x > 0` → semantic guard helpers */
  preferSemanticGuardHelpers: 36,
  /** `Object.is(x, true/false)` / `readBoolean(record, key) !== true` → `isTrue(record?.key)` / `isFalse(record?.key)` */
  preferBooleanLiteralGuards: 37,
  /** JSX `data-*={cond ? 'true' : 'false'}` → `data-*={cond}` */
  preferBooleanDataAttribute: 38,
  /** JSX `cond ? <X /> : null` → `cond && <X />` */
  preferConditionalJsxAnd: 39,
  /** `cond ? true : false` / boolean literal return pair → 直接 boolean 表达式 */
  simplifyUselessBooleanConditional: 40,
} as const

export { CodeStyleFixPhase }
