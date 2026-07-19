/**
 * arch-guard 内部使用的极简 logger。
 *
 * 该包必须可移植，不能依赖宿主项目的 Log 全局；因此这里走标准 console，
 * 但默认安静（仅在 verbose 模式下输出 info/debug），保证 CI 输出整洁。
 */
type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';
interface ArchGuardLogger {
    error(message: string, data?: unknown): void;
    warn(message: string, data?: unknown): void;
    info(message: string, data?: unknown): void;
    debug(message: string, data?: unknown): void;
}
declare const LevelRank: Record<LogLevel, number>;
/** 创建一个按级别过滤的 logger。tag 用于在输出前加前缀，便于定位来源。 */
declare function createLogger(level?: LogLevel, tag?: string): ArchGuardLogger;
export { createLogger, LevelRank };
export type { ArchGuardLogger, LogLevel };
//# sourceMappingURL=logger.d.ts.map