/**
 * 守卫后仍断言门：`isObject(x)` 收窄到 `object` 之后又写 `x as Record<string, unknown>`
 * 才能读字段——断言把类型系统从这一步踢出去了，字段拼错、形状变了都不会报。
 *
 * `isObject` 只保证「非 null 的 object」（含数组、Date、类实例），所以它之后必然还要断言；
 * `isPlainObject`（= `isRecord`，core 已有）直接收窄成 `Record<string, unknown>`，
 * 换掉守卫就不再需要断言，字段读取重新受 TS 管辖。
 *
 * 判定：同一文件里既有 `isObject(P)` 又有 `P as Record<string, unknown>`（P 为同一标识符或
 * 同一属性路径），在断言处计一条。**不覆盖** `isObject` 的合法用法——真要接受数组 / 类实例
 * 而后续没有 Record 断言的，本门不看。
 *
 * 软性计数门（plugin 默认把 code-style 降一级）：存量冻结、新增在 CI 日志可见，
 * 不硬拦以免误伤「断言目标不是 Record 形态」的边界写法。
 */
declare const preferIsPlainObjectOverGuardedRecordCast: import("../../index.js").Check;
export { preferIsPlainObjectOverGuardedRecordCast };
//# sourceMappingURL=preferIsPlainObjectOverGuardedRecordCast.d.ts.map