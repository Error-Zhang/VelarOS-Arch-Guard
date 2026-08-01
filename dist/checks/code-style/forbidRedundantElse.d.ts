/**
 * 当 if 分支已经 return/throw/continue/break 时，else 分支是冗余的——直接平铺出去更清爽：
 *
 *   if (a) {
 *     return foo
 *   } else {                    // ← 冗余
 *     doSomething()
 *   }
 *
 * 改写：
 *
 *   if (a) return foo
 *   doSomething()
 *
 * 这条规则强制使用 early-return 风格，让"主路径"留在最外层缩进。
 */
declare const forbidRedundantElse: import("../../index.js").Check;
export { forbidRedundantElse };
//# sourceMappingURL=forbidRedundantElse.d.ts.map