import type { ResolvedConfig } from '../config/types'

import type { FixContext } from './fixContext'
import type { ArchGuardLogger } from './logger'
import type { ReportAggregate } from './report'
import type { Violation } from './violation'

/** CLI `fix` 优先于配置文件 `config.fix`；`undefined` 表示沿用配置。 */
function resolveFixEnabled(cliFix: boolean | undefined, config: ResolvedConfig): boolean {
  if (cliFix === false) return false
  if (cliFix === true) return true
  return config.fix ?? false
}

function isFixAllowedForCheck(checkId: string, config: ResolvedConfig): boolean {
  const rule = config.rules?.[checkId]
  const ruleRecord =
    typeof rule === 'object' && rule !== null ? (rule as { fix?: unknown }) : null
  if (ruleRecord?.fix !== undefined) {
    const fix = ruleRecord.fix
    if (fix === false) return false
  }
  return true
}

function collectFixableViolations(
  aggregate: ReportAggregate,
  config: ResolvedConfig,
  globalFix: boolean
): Violation[] {
  if (!globalFix) return []
  const out: Violation[] = []
  for (const violation of aggregate.allViolations) {
    if (!violation.applyFix) continue
    if (!isFixAllowedForCheck(violation.checkId, config)) continue
    out.push(violation)
  }
  return out
}

function fixSortKey(violation: Violation): number {
  if (violation.fixStartOffset !== undefined) return violation.fixStartOffset
  const line = violation.line ?? 0
  const column = violation.column ?? 0
  return line * 1_000_000 + column
}

function fixPassOffsetKey(violation: Violation): string {
  return `${violation.fixPhase ?? DEFAULT_FIX_PHASE}:${fixSortKey(violation)}`
}

/** 未声明 {@link Violation.fixPhase} 的修复：排在所有显式阶段之后。 */
const DEFAULT_FIX_PHASE = 1000

/**
 * 同一轮只应用每个文件当前最早的 fix phase。
 *
 * fixer 持有的是本轮检查时的 AST/source offset。不同 phase 的 fixer 可能会在同一个文件里
 * 先后改写文本；若前一个 phase 改短/改长了后续位置，后一个 phase 继续使用旧 offset 会切到
 * 错误位置。Runner 会在每轮修复后清空缓存并重跑检查，因此跨 phase 依赖必须通过下一轮重新
 * 解析来完成。
 */
function collectCurrentFixPass(violations: readonly Violation[]): Violation[] {
  const withFile = violations.filter((v): v is Violation & { file: string } => Boolean(v.file))
  const grouped = new Map<string, Violation[]>()
  for (const violation of withFile) {
    const list = grouped.get(violation.file) ?? []
    list.push(violation)
    grouped.set(violation.file, list)
  }
  const result: Violation[] = []
  for (const list of grouped.values()) {
    const minPhase = Math.min(...list.map((violation) => violation.fixPhase ?? DEFAULT_FIX_PHASE))
    const seenOffsets = new Set<string>()
    const currentPhaseViolations = list
      .filter((violation) => (violation.fixPhase ?? DEFAULT_FIX_PHASE) === minPhase)
      .sort((a, b) => fixSortKey(b) - fixSortKey(a))
    for (const violation of currentPhaseViolations) {
      const offsetKey = fixPassOffsetKey(violation)
      if (seenOffsets.has(offsetKey)) continue

      seenOffsets.add(offsetKey)
      result.push(violation)
    }
  }
  return result
}

async function applyScheduledFixes(
  violations: readonly Violation[],
  ctx: FixContext,
  log: ArchGuardLogger
): Promise<number> {
  let applied = 0
  for (const violation of collectCurrentFixPass(violations)) {
    const fixer = violation.applyFix
    if (!fixer) continue
    try {
      await fixer(ctx)
      applied += 1
      log.info(
        `arch-guard: applied fix for ${violation.ruleId} (${violation.file ?? '?'}:${violation.line ?? '?'})`
      )
    } catch (error) {
      log.warn(
        `arch-guard: fix failed for ${violation.ruleId} (${violation.file ?? '?'}): ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }
  }
  return applied
}

export { applyScheduledFixes, collectFixableViolations, resolveFixEnabled }
