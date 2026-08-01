/**
 * 当一段代码用 `if/else if/else if/...` 或一组连续的 `if (x === 'a') return ...; if (x === 'b') return ...;`
 * 表示"同一个 discriminant 的不同分支"时，应该用更合适的形式表达：
 *
 *  - 单个 if + 默认出口：保留 guard/default 写法
 *  - 至少两个显式 if 比较后才提示改写
 *  - 2~4 分支：用 switch
 *  - ≥5 分支：用 table-driven lookup（Map 或对象常量）
 *
 * 合并了旧的两段子规则（else-if 链 + sequential if 链），统一一处实现。
 */
declare const preferTableBranching: import("../../index.js").Check;
export { preferTableBranching };
//# sourceMappingURL=preferTableBranching.d.ts.map