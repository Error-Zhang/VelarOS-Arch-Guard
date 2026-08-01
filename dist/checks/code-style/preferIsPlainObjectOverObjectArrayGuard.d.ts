/**
 * - 顶层 **`&&`**：扁平常的 **`typeof x === 'object' && x !== null && !Array.isArray(x)`** → **`isPlainObject(x)`**（与
 *   `forbid-raw-runtime-type-guards` 协作：子式不因先被修成 `isObject`/`isArray` 而被拆散）。
 * - `value && isObject(value) && !isArray(value)` → **`isPlainObject(value)`**（`&&` 链）。
 * - **`!value || !isObject(value) || isArray(value)`**，以及同一语义的 **De Morgan 二连**
 *   **`!isObject(value) || isArray(value)`** / **`typeof value !== 'object' || Array.isArray(value)`** 等；
 *   另支持 **falsy / nullish** 槽多种写法：`!x`，`x == null` / `=== null` / `=== undefined`，`typeof x === 'undefined'`（及 `==`），`isNull` / `isUndefined`，`!isPresent`；**非 object** 槽含 `typeof` 的 `!=` / `!==`；均为 **扁平** **`||`** 三连（或二连）且 **顺序任意** → **`!isPlainObject(value)`**。
 *
 * 链上若还有其它子式，只替换识别到的 **连续** 二连/三连窗口，保留两侧原文。
 *
 * 同时纠正逻辑运算符后缺少空格的拼接。
 */
declare const preferIsPlainObjectOverObjectArrayGuard: import("../../index.js").Check;
export { preferIsPlainObjectOverObjectArrayGuard };
//# sourceMappingURL=preferIsPlainObjectOverObjectArrayGuard.d.ts.map