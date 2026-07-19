/**
 * arch-guard 内部使用的极简 logger。
 *
 * 该包必须可移植，不能依赖宿主项目的 Log 全局；因此这里走标准 console，
 * 但默认安静（仅在 verbose 模式下输出 info/debug），保证 CI 输出整洁。
 */
type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug'

interface ArchGuardLogger {
  error(message: string, data?: unknown): void
  warn(message: string, data?: unknown): void
  info(message: string, data?: unknown): void
  debug(message: string, data?: unknown): void
}

const LevelRank: Record<LogLevel, number> = {
  silent: -1,
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
}

/** 创建一个按级别过滤的 logger。tag 用于在输出前加前缀，便于定位来源。 */
function createLogger(level: LogLevel = 'warn', tag?: string): ArchGuardLogger {
  const threshold = LevelRank[level]
  const prefix = tag ? `[arch-guard:${tag}]` : '[arch-guard]'

  function emit(method: 'error' | 'warn' | 'log', rank: number, message: string, data?: unknown): void {
    if (rank > threshold) return
    const out = data === undefined ? `${prefix} ${message}` : `${prefix} ${message}`
    if (method === 'log') {
      console.info(out, data ?? '')
    } else if (method === 'error') {
      console.error(out, data ?? '')
    } else {
      console.warn(out, data ?? '')
    }
  }

  return {
    error(message, data) {
      emit('error', LevelRank.error, message, data)
    },
    warn(message, data) {
      emit('warn', LevelRank.warn, message, data)
    },
    info(message, data) {
      emit('log', LevelRank.info, message, data)
    },
    debug(message, data) {
      emit('log', LevelRank.debug, message, data)
    },
  }
}

export { createLogger, LevelRank }
export type { ArchGuardLogger, LogLevel }
