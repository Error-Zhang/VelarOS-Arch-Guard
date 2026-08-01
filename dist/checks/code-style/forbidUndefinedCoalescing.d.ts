/**
 * 禁止 `expr ?? undefined` 这类内联缺席归一化（宪章 §12.6「`?? undefined` 全仓禁绝」）。
 *
 * `undefined` 只保留语言原生语义（可选参数/属性未提供、外部 API 交界），不当值传递；
 * 缺席语义直接由 contract 表达（可选属性用 `?:`，值缺席用 `Nullable<T>`）。
 *
 * 与 `forbid-nullish-churn` 并列同族：churn 是软性风格 nudge（warning），本门是 §12.6
 * 硬棘轮（error），对 `?? undefined` 立门——存量入 baseline，新增即红。
 */
declare const forbidUndefinedCoalescing: import("../../index.js").Check;
export { forbidUndefinedCoalescing };
//# sourceMappingURL=forbidUndefinedCoalescing.d.ts.map