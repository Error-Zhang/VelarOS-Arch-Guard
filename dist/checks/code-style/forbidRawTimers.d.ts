/**
 * 运行时代码不得直接调用原生 setTimeout/setInterval/requestAnimationFrame 等；
 * 必须通过 TimerScope / useTimerScope 注册到生命周期作用域，避免卸载后内存泄漏和回调失序。
 *
 * 识别 `setTimeout(...)`、`window.setTimeout(...)`、`globalThis.setInterval(...)` 等形式；
 * 不会误伤 `myObj.setTimeout`（非全局 owner）。
 */
declare const forbidRawTimers: import("../../index.js").Check;
export { forbidRawTimers };
//# sourceMappingURL=forbidRawTimers.d.ts.map