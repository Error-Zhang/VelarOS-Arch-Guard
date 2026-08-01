/**
 * 提示低价值的 React useMemo：只返回轻量对象/数组字面量，却维护了一长串依赖。
 *
 * 这类包装经常让代码看起来"被优化过"，但实际收益需要下游引用稳定性来证明；
 * 否则依赖列表会变成重复状态声明，改字段时很容易漏。
 */
declare const preferMeaningfulUseMemo: import("../../index.js").Check;
export { preferMeaningfulUseMemo };
//# sourceMappingURL=preferMeaningfulUseMemo.d.ts.map