/**
 * 禁止内联 **`cond ? value : undefined`**（及反写 **`cond ? undefined : value`**）。
 *
 * - 一般条件不自动修复，避免把 callback truthiness 改成 `optionalWhen(callback, value)`
 * - **`x ? x : undefined`** → **`toOptional(x)`**（与 **`forbid-nullish-churn`** 分工）
 * - **`isNumber(x) ? x : undefined`** → **`toOptional(numberOrNull(x))`**（与 **`forbid-nullish-churn`** 同相位）
 * - **`isString(x) ? x : undefined`** → **`optionalWhen(isString, x)`**
 * - **`optionalWhen(isString, value) ?? fallback`** → **`optionalWhen(isString, value, fallback)`**
 */
declare const preferOptionalWhenOverConditionalUndefined: import("../../index.js").Check;
export { preferOptionalWhenOverConditionalUndefined };
//# sourceMappingURL=preferOptionalWhenOverConditionalUndefined.d.ts.map