/**
 * 内置规则总入口。
 *
 * `@velaros-ai/arch-guard` 只内置所有 JS/TS 项目都可直接复用的基础规则；
 * 项目策略型规则（imports / packages / i18n / docs / comments / code-style）
 * 放在对应项目插件中维护。
 */
export { crossFileDuplication, duplicationChecks } from './duplication/index.js';
//# sourceMappingURL=index.d.ts.map