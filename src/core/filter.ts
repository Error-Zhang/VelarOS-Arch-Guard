import type { Check } from './defineCheck'

/**
 * Check 过滤器。
 *
 * CLI 的 --only/--skip/--tag 选项会归一到这个数据结构，
 * Runner 在调度前用 `passes(check)` 判定是否执行某个 check。
 */
interface CheckFilter {
  only?: ReadonlySet<string>
  skip?: ReadonlySet<string>
  tags?: ReadonlySet<string>
}

interface CheckFilterInput {
  only?: readonly string[]
  skip?: readonly string[]
  tags?: readonly string[]
}

function buildCheckFilter(input?: CheckFilterInput): CheckFilter {
  return {
    only: input?.only ? new Set(input.only) : undefined,
    skip: input?.skip ? new Set(input.skip) : undefined,
    tags: input?.tags ? new Set(input.tags) : undefined,
  }
}

/** 判定一个 check 是否应被执行。 */
function passesFilter(check: Check, filter: CheckFilter): boolean {
  if (filter.only && filter.only.size > 0 && !filter.only.has(check.id)) return false
  if (filter.skip && filter.skip.has(check.id)) return false
  if (filter.tags && filter.tags.size > 0) {
    const checkTags = check.tags ?? []
    const hasTag = checkTags.some((tag) => filter.tags!.has(tag))
    if (!hasTag) return false
  }
  return true
}

export { buildCheckFilter, passesFilter }
export type { CheckFilter, CheckFilterInput }
