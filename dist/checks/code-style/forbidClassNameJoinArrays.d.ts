/**
 * 禁止在 JSX 上用 `[...].join(' ')` 拼装 className。
 * Tailwind/utility 类名应置于 CSS Module、共享样式或设计系统封装组件中，而不是在组件里堆字符串片段。
 */
declare const forbidClassNameJoinArrays: import("../../index.js").Check;
export { forbidClassNameJoinArrays };
//# sourceMappingURL=forbidClassNameJoinArrays.d.ts.map