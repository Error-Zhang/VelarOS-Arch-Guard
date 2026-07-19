const LevelRank = {
    silent: -1,
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
};
/** 创建一个按级别过滤的 logger。tag 用于在输出前加前缀，便于定位来源。 */
function createLogger(level = 'warn', tag) {
    const threshold = LevelRank[level];
    const prefix = tag ? `[arch-guard:${tag}]` : '[arch-guard]';
    function emit(method, rank, message, data) {
        if (rank > threshold)
            return;
        const out = data === undefined ? `${prefix} ${message}` : `${prefix} ${message}`;
        if (method === 'log') {
            console.info(out, data ?? '');
        }
        else if (method === 'error') {
            console.error(out, data ?? '');
        }
        else {
            console.warn(out, data ?? '');
        }
    }
    return {
        error(message, data) {
            emit('error', LevelRank.error, message, data);
        },
        warn(message, data) {
            emit('warn', LevelRank.warn, message, data);
        },
        info(message, data) {
            emit('log', LevelRank.info, message, data);
        },
        debug(message, data) {
            emit('log', LevelRank.debug, message, data);
        },
    };
}
export { createLogger, LevelRank };
//# sourceMappingURL=logger.js.map