/**
 * JSX 条件渲染只需要表达“渲染或不渲染”时，用 `&&` 比 `? … : null` 更短。
 *
 * 非布尔条件必须先转成 boolean，避免 React 把 `0` 等值渲染出来。
 *
 * 只在 **JSX 子表达式** `{...}` 位置生效：那里子节点类型是 `ReactNode`，接受 `false`。
 * `return`、变量赋值、`ReactElement | null` 的 render prop / 组件返回等位置**不改**——
 * 那里 `cond && <JSX/>` 会退化成 `false | Element`，与 `ReactElement | null` 不兼容造成
 * 类型错误（历史上该规则在这些位置误改并把源码改坏过）。
 */
declare const preferConditionalJsxAnd: import("../../index.js").Check;
export { preferConditionalJsxAnd };
//# sourceMappingURL=preferConditionalJsxAnd.d.ts.map