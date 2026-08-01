/**
 * 吞异常门：把"静默吞错"立成计数棘轮（存量入 baseline，看板只降不升）。
 *
 * 覆盖两种 `require-error-logging` 现有守卫够不着的空吞面：
 *   1. **空 catch 块** `catch { }`（body 无语句）——彻底静默。
 *   2. **空 promise catch** `.catch(() => {})` / `.catch(() => undefined)` / `.catch(async () => {})`
 *      / `.catch(function () {})`——`require-error-logging` 只走 `ts.CatchClause`，不走 `.catch()` 调用。
 *
 * 复用同一套内联豁免标记（`SilentCatchSuppressionMarkers`，单源自 requireErrorLogging）：
 * 紧邻处写明原因的注解视为合法 fallback，无注解的才计数。软性门（warning）：不硬拦以免误伤
 * 真·fallback 路径，但存量冻结、新增在 CI 日志可见。
 */
declare const forbidSwallowedErrors: import("../../index.js").Check;
export { forbidSwallowedErrors };
//# sourceMappingURL=forbidSwallowedErrors.d.ts.map