/**
 * 严重级别枚举。
 *
 * 与 ESLint / SARIF 对齐：error 必须 fail CI，warning 不 fail 但仍打印，
 * info 仅记录提示，off 表示彻底禁用一条规则（通过配置覆盖时使用）。
 */
type SeverityLevel = 'error' | 'warning' | 'info' | 'off'

const SeverityRank: Record<SeverityLevel, number> = {
  off: -1,
  info: 0,
  warning: 1,
  error: 2,
}

/** 是否构成 CI 失败（仅 error）。 */
function isFailingSeverity(level: SeverityLevel): boolean {
  return level === 'error'
}

/** 严重级别排序：取两个之中更高的那个。 */
function maxSeverity(a: SeverityLevel, b: SeverityLevel): SeverityLevel {
  return SeverityRank[a] >= SeverityRank[b] ? a : b
}

/** 把任意字符串收窄到合法 SeverityLevel，无法识别时返回 fallback。 */
function coerceSeverity(value: unknown, fallback: SeverityLevel = 'error'): SeverityLevel {
  if (value === 'error' || value === 'warning' || value === 'info' || value === 'off') return value
  return fallback
}

export { coerceSeverity, isFailingSeverity, maxSeverity, SeverityRank }
export type { SeverityLevel }
