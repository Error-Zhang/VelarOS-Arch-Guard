/**
 * 禁止在业务逻辑里反复内联改写缺席值。
 *
 * 需要收敛到 nullable 边界时使用全局 **`toNullable(expr)`**。
 *
 * 其它 absence 语义仍应在专用边界 helper（normalizer / adapter / mapper）里一次处理，
 * 避免在业务逻辑里反复转换或把 `undefined` 偷偷换成 `null` 的语义漂移。
 *
 * 合并了旧的两段子规则：
 *  - fallback churn。
 *  - presence ternary 与单参 IIFE 等价式。
 */
declare const forbidNullishChurn: import("../../index.js").Check;
export { forbidNullishChurn };
//# sourceMappingURL=forbidNullishChurn.d.ts.map