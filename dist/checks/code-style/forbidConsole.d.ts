/**
 * 业务源码禁止直接调用 `console.*`，必须走全局 Log（Log.tag(scope).debug/info/warn/error）。
 *
 * AST-based 实现：识别 `console.method()` 调用以及 `console['method']` 动态访问；
 * 不会误伤 `someObj.console.foo`、JSDoc 中的 console 文本、字符串等。
 *
 * 豁免：日志实现本体等文件由 options `allowFiles` 逐条声明；生成物 / 测试 / 便携库整体豁免见 `_shared`。
 */
declare const forbidConsole: import("../../index.js").Check;
export { forbidConsole };
//# sourceMappingURL=forbidConsole.d.ts.map