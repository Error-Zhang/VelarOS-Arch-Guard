import type { Reporter } from './types.js';
/**
 * 默认终端 reporter：按 check + section 分组打印，便于人类阅读。
 *
 * 输出无颜色（保持 CI 日志干净），如需高亮可在 CLI 外层套 chalk。
 */
declare const stylishReporter: Reporter;
export { stylishReporter };
//# sourceMappingURL=stylish.d.ts.map