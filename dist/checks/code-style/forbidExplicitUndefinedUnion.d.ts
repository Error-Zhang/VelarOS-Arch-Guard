/**
 * 缺席值门 · 值位 `T | undefined` 计数棘轮（宪章 §12.6「缺席值单一」）。
 *
 * "值的缺席"只用 `null`（`Nullable<T>`）表达；`undefined` 只保留语言原生语义。
 * 在**值位**手写 `| undefined`（契约字段/返回/别名的值类型）属于把 `undefined` 当值传递。
 *
 * 口径（贴普查「非可选 prop/param 声明位」，得 ~134 而非全量 union）——仅计：
 *   - 直接作为**属性签名 / 类字段 / 参数**类型的 `| undefined` union，且该声明**不带 `?`**。
 * 因此不计：返回类型 / 类型别名 RHS / 泛型实参内嵌 union / 带 `?` 的 optional 语法位 /
 * 局部变量声明（`let x: T | undefined` 原生未赋值边界）——这些属边界或原生 optional 语义。
 *
 * 与 `forbid-nullish-churn` / `forbid-undefined-coalescing` 并列同族。软性计数门（warning）：
 * 存量入 baseline 建立计数基线，看板只降不升；不硬拦以免误伤边界注解，新增在 CI 日志可见。
 */
declare const forbidExplicitUndefinedUnion: import("../../index.js").Check;
export { forbidExplicitUndefinedUnion };
//# sourceMappingURL=forbidExplicitUndefinedUnion.d.ts.map