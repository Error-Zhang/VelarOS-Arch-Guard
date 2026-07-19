import type { UserConfig } from './types.js';
/**
 * 用户 arch-guard.config.{mjs,js,ts} 的辅助类型函数。
 *
 * 仅做类型辅助，不做运行时检验；运行时检验在 loadConfig 中完成。
 */
declare function defineConfig(config: UserConfig): UserConfig;
export { defineConfig };
//# sourceMappingURL=defineConfig.d.ts.map