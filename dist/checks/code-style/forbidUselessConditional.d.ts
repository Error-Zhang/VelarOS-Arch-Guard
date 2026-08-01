/**
 * 三元/if 把 boolean 再"包装一次"是冗余的。
 *
 *   x ? true : false                 →  !!x
 *   x ? false : true                 →  !x
 *   if (cond) return true; return false  →  return !!cond
 *   if (cond) { return true } else { return false }  →  return !!cond
 *
 * 这条规则只识别非常保守的模式（两边都是 true/false literal），不会误伤业务。
 */
declare const forbidUselessConditional: import("../../index.js").Check;
export { forbidUselessConditional };
//# sourceMappingURL=forbidUselessConditional.d.ts.map