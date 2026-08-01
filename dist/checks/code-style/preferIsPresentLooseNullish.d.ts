/**
 * 宽松 **`expr != null`** / **`expr == null`**（及 **`undefined`** 的 **`==`/`!=`**）应写成 **`isPresent(expr)`** / **`!isPresent(expr)`**。
 *
 * **豁免**：守卫本体所在文件（`isPresent` 实现就是 **`return value != null`**，不能改为自调用）须由 options `allowFiles` 声明。
 */
declare const preferIsPresentLooseNullish: import("../../index.js").Check;
export { preferIsPresentLooseNullish };
//# sourceMappingURL=preferIsPresentLooseNullish.d.ts.map