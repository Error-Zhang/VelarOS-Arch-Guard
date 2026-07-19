import { existsSync, readFileSync } from 'node:fs'

import { writeFileAtomically } from '../utils/atomicWrite'

import { type Violation,violationKey } from './violation'

/**
 * Baseline 记录格式。
 *
 * - 每条 entry 用 fingerprint 索引，runner 启动时加载，违规列表在输出前会按 baseline 过滤。
 * - 同时保留 message 摘要用于人类阅读和 review diff。
 *
 * Baseline 文件 schema 故意非常简单，便于 git diff 审查；写入时按 key 排序。
 */
interface BaselineEntry {
  checkId: string
  ruleId: string
  fingerprint: string
  message: string
  file?: string
  addedAt?: string
}

interface BaselineFile {
  version: 1
  entries: readonly BaselineEntry[]
}

/**
 * 内存中的 baseline：构造时加载，查询时按 violationKey 命中。
 * 还会跟踪哪些 baseline 条目"应该出现但未出现"（stale），帮助清理。
 */
class Baseline {
  private readonly entries: ReadonlyMap<string, BaselineEntry>
  private readonly hits: Set<string> = new Set()

  constructor(entries: readonly BaselineEntry[]) {
    this.entries = new Map(
      entries.map((entry) => [keyFromBaselineEntry(entry), entry] as const)
    )
  }

  /** 是否被 baseline 豁免；命中时把该 entry 标记为已使用。 */
  public isWaived(violation: Violation): boolean {
    const key = violationKey(violation)
    if (this.entries.has(key)) {
      this.hits.add(key)
      return true
    }
    return false
  }

  /** 本次 run 中未被任何违规命中的 baseline 条目（清理候选）。 */
  public get staleEntries(): BaselineEntry[] {
    const result: BaselineEntry[] = []
    for (const [key, entry] of this.entries) {
      if (!this.hits.has(key)) {
        result.push(entry)
      }
    }
    return result
  }

  /** 本次 run 仍然命中的 baseline 条目，可用于移除已解决的 stale entries。 */
  public get matchedEntries(): BaselineEntry[] {
    const result: BaselineEntry[] = []
    for (const [key, entry] of this.entries) {
      if (this.hits.has(key)) {
        result.push(entry)
      }
    }
    return result
  }
}

function keyFromBaselineEntry(entry: BaselineEntry): string {
  return `${entry.checkId}::${entry.ruleId}::${entry.fingerprint}`
}

/** 从磁盘加载 baseline 文件。文件不存在时返回空 baseline。 */
function loadBaselineFile(filePath: string): Baseline {
  if (!existsSync(filePath)) return new Baseline([])
  const text = readFileSync(filePath, 'utf-8')
  const parsed = JSON.parse(text) as Partial<BaselineFile>
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.entries)) {
    throw new Error(`arch-guard: invalid baseline file at ${filePath}`)
  }
  return new Baseline(parsed.entries)
}

/** 把当前 violations 序列化成 baseline 文件，原子写盘。 */
function writeBaselineFile(filePath: string, violations: readonly Violation[]): void {
  const entries: BaselineEntry[] = violations
    .map((violation) => {
      const entry: BaselineEntry = {
        checkId: violation.checkId,
        ruleId: violation.ruleId,
        fingerprint: violation.fingerprint,
        message: violation.message,
      }
      if (violation.file !== undefined) entry.file = violation.file
      return entry
    })
  writeBaselineEntriesFile(filePath, entries)
}

/** 把 baseline entries 原样写回，保留现有 message / file / addedAt 元数据。 */
function writeBaselineEntriesFile(filePath: string, entries: readonly BaselineEntry[]): void {
  const sortedEntries = [...entries].sort((a, b) =>
    keyFromBaselineEntry(a).localeCompare(keyFromBaselineEntry(b))
  )

  const payload: BaselineFile = {
    version: 1,
    entries: sortedEntries,
  }

  writeFileAtomically(filePath, `${JSON.stringify(payload, null, 2)}\n`)
}

export { Baseline, loadBaselineFile, writeBaselineEntriesFile, writeBaselineFile }
export type { BaselineEntry, BaselineFile }
