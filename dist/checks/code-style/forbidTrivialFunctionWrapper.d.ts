/**
 * 禁止「仅把参数按序透传给另一函数」的无意义具名封装（`function f(a){return g(a)}`）。
 * 请改为在调用方直接使用目标函数，或使用 `export { g as f } from` 等再导出（不产生多余栈帧）。
 *
 * 覆盖面（宪章 §12.5「无域语义的一行转发函数禁止」）：
 *   - export / default 的 `function` 声明。
 *   - **任意** `const x = (…) => impl(…)` / `const x = function(…){ return impl(…) }`——
 *     不再局限于 export 顶层，local const 箭头转发同样计入（普查盲区）。
 * async / 解构参数 / rest / 走向 import 值或方法调用的边界薄封装保守跳过。
 */
declare const forbidTrivialFunctionWrapper: import("../../index.js").Check;
export { forbidTrivialFunctionWrapper };
//# sourceMappingURL=forbidTrivialFunctionWrapper.d.ts.map