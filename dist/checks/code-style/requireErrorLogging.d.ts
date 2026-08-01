declare const SilentCatchSuppressionMarkers: readonly ["arch-guard-ignore require-error-logging", "arch-guard:silent-catch-ok"];
/**
 * `catch (err) { ... }` 不允许"静默吞错"：必须以下其一
 *   - re-throw
 *   - 调用 Log/messageLatest/onXxxError.current 等已知的 reporting 渠道
 *   - 返回/赋值一个 ErrorResult 形态对象 (`{ ok: false, ... }` / `{ error: ... }` / `{ kind: 'error', ... }`)
 *   - 把 catch 参数（error/err/e/...）直接作为返回值/结构字段透传到上层
 *   - 加内联豁免注释（详见 SilentCatchSuppressionMarkers）——用于"本身就是 fallback 路径"
 *
 * 启发式：以名字模式 + 已知 reporting helper 识别"算是处理了"。
 * 若启发式还不够，可在团队规范里把"通过 Result.fail/ResultFactory.fail"也加进 ErrorReportingTextPatterns。
 */
declare const requireErrorLogging: import("../../index.js").Check;
export { requireErrorLogging, SilentCatchSuppressionMarkers };
//# sourceMappingURL=requireErrorLogging.d.ts.map