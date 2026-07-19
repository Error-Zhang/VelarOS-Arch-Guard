import type { Reporter } from './types.js';
/**
 * GitHub Actions reporter：把每条违规输出成 `::error file=...,line=...::message`
 * 形式，PR 上即可看到行内注释。
 */
declare const githubReporter: Reporter;
export { githubReporter };
//# sourceMappingURL=github.d.ts.map