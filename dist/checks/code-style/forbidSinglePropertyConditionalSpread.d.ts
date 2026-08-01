/**
 * 禁止单属性条件对象展开。
 *
 * `...(x ? { x } : {})` 看起来“函数式”，但对单个可选字段可读性很差。
 * 业务对象需要可选字段时统一写 `field: toOptional(value)`，带条件时写
 * `field: optionalWhen(isX, value)`；普通条件不自动修复，避免把 callback
 * truthiness 改成 `optionalWhen(callback, value)`。
 */
declare const forbidSinglePropertyConditionalSpread: import("../../index.js").Check;
export { forbidSinglePropertyConditionalSpread };
//# sourceMappingURL=forbidSinglePropertyConditionalSpread.d.ts.map