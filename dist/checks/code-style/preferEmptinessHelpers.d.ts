/**
 * 业务代码用具名导出 `isEmpty(x)` / `isBlank(x)`（`@velaros-ai/core`）表达空检查，避免 `.length === 0`
 * / `=== ''` / `.trim().length === 0` 之类样板。
 *
 * 这是原型扩展 `.isEmpty` / `.isBlank` 去全局化后的接替检查：能力从 `String`/`Array` 原型迁到具名函数，
 * 「土办法」（裸 length / 空串比较）仍要挡住，锁死 house dialect。
 *
 * 仅作用于运行时业务代码（_shared 已默认排除便携包 / logger / typeGuards）。
 * 启发式判定 array-like / string-like：变量名后缀（Items、Names...）、变量声明类型、形参类型，
 * 以及 .filter/.map/.split/...trim() 等"已知 string-producing"调用。
 */
declare const preferEmptinessHelpers: import("../../index.js").Check;
export { preferEmptinessHelpers };
//# sourceMappingURL=preferEmptinessHelpers.d.ts.map