import type { UserConfig } from './types'

/**
 * 用户 arch-guard.config.{mjs,js,ts} 的辅助类型函数。
 *
 * 仅做类型辅助，不做运行时检验；运行时检验在 loadConfig 中完成。
 */
function defineConfig(config: UserConfig): UserConfig {
  return config
}

export { defineConfig }
