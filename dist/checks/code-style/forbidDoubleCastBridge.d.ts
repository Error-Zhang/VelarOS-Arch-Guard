/**
 * 禁止 `as unknown as X` / `as any as X` 这类双重断言"跳板"（宪章 §12.5「`as unknown as` 全仓禁绝」）。
 *
 * `as` 不是判定堆的药方，是骗编译器：真正需要收敛外来数据时在边界解析一次
 * （zod / ForgivingSchema / 共享守卫），信任区之内信任类型系统。
 *
 * 覆盖两种跳板 inner 类型：
 *   - `x as unknown as X`（`unknown` 跳板）
 *   - `x as any as X`（`any` 跳板，取代仅捕 `as any as` 的旧 opt-in `forbidDoubleAsAny`）
 *
 * 检测走 AST（`ts.AsExpression` 内层还是 `AsExpression` 且其 type 为 `unknown`/`any`），
 * 因此字符串字面量与注释里的 "as unknown as" 不会误报。
 */
declare const forbidDoubleCastBridge: import("../../index.js").Check;
export { forbidDoubleCastBridge };
//# sourceMappingURL=forbidDoubleCastBridge.d.ts.map