import type { Check } from './defineCheck'
import { coerceSeverity, isFailingSeverity, type SeverityLevel } from './severity'
import { computeFingerprint, type Violation, type ViolationInput } from './violation'

/**
 * 单个 check 在一次执行中的报告。
 *
 * 通过 `report.section('xxx')` 把同一个 check 内部的不同违规类型分桶展示。
 * 引擎在 runner 中创建并传给 check.run；check 不直接构造 Report。
 */
class CheckReport {
  readonly check: Check
  readonly sections: Map<string, CheckReportSection> = new Map()
  /** 由 runner 注入的有效严重级别（已经合并 config 覆盖）。 */
  effectiveSeverity: SeverityLevel

  constructor(check: Check, effectiveSeverity: SeverityLevel) {
    this.check = check
    this.effectiveSeverity = effectiveSeverity
  }

  /** 获取（或创建）一个 section。同名 section 会被合并。 */
  public section(title: string): CheckReportSection {
    const existing = this.sections.get(title)
    if (existing) return existing
    const section = new CheckReportSection(this, title)
    this.sections.set(title, section)
    return section
  }

  /** 简易模式：直接添加到 "General" section。 */
  public add(input: ViolationInput | string): void {
    this.section('General').add(input)
  }

  /** 所有 section 的违规扁平列表。 */
  public get violations(): Violation[] {
    const all: Violation[] = []
    for (const section of this.sections.values()) {
      all.push(...section.violations)
    }
    return all
  }

  public get hasViolations(): boolean {
    return this.violations.length > 0
  }

  /** 是否触发 CI 失败：取决于本 check 的有效严重级别 + 是否有违规。 */
  public get hasFailures(): boolean {
    return this.hasViolations && isFailingSeverity(this.effectiveSeverity)
  }

  public get failedSections(): CheckReportSection[] {
    return [...this.sections.values()].filter((section) => section.violations.length > 0)
  }
}

/**
 * Report 内部按职责分组的违规桶。
 *
 * 每个 section 表示同一个 check 内部的一类违规（如 "Layer boundaries"、"Database access"），
 * 输出时按 section 分块，便于阅读和 baseline 维护。
 */
class CheckReportSection {
  readonly report: CheckReport
  readonly title: string
  readonly violations: Violation[] = []

  constructor(report: CheckReport, title: string) {
    this.report = report
    this.title = title
  }

  /** 添加一条违规；接受字符串简写或完整 ViolationInput。 */
  public add(input: ViolationInput | string): Violation {
    const normalized = typeof input === 'string' ? { ruleId: 'default', message: input } : input
    const violation = this.materialize(normalized)
    this.violations.push(violation)
    return violation
  }

  /** 批量添加。 */
  public addAll(inputs: ReadonlyArray<ViolationInput | string>): Violation[] {
    return inputs.map((input) => this.add(input))
  }

  private materialize(input: ViolationInput): Violation {
    const ruleId = `${this.report.check.id}/${input.ruleId}`
    const fingerprint = computeFingerprint([
      ruleId,
      this.title,
      input.file,
      input.fingerprintInput ?? input.message,
    ])
    const violation: Violation = {
      ruleId,
      checkId: this.report.check.id,
      sectionTitle: this.title,
      severity: this.report.effectiveSeverity,
      message: input.message,
      fingerprint,
    }
    if (input.file !== undefined) violation.file = input.file
    if (input.line !== undefined) violation.line = input.line
    if (input.column !== undefined) violation.column = input.column
    if (input.fixPhase !== undefined) violation.fixPhase = input.fixPhase
    if (input.fixStartOffset !== undefined) violation.fixStartOffset = input.fixStartOffset
    if (input.suggestion !== undefined) violation.suggestion = input.suggestion
    if (input.data !== undefined) violation.data = input.data
    if (input.applyFix !== undefined) violation.applyFix = input.applyFix
    return violation
  }
}

/** 聚合多个 CheckReport 的总结果。 */
class ReportAggregate {
  readonly reports: CheckReport[] = []

  public add(report: CheckReport): void {
    this.reports.push(report)
  }

  public get allViolations(): Violation[] {
    return this.reports.flatMap((report) => report.violations)
  }

  public get failingReports(): CheckReport[] {
    return this.reports.filter((report) => report.hasFailures)
  }

  public get hasFailures(): boolean {
    return this.failingReports.length > 0
  }

  public summary(): ReportSummary {
    const counts: Record<SeverityLevel, number> = { error: 0, warning: 0, info: 0, off: 0 }
    for (const violation of this.allViolations) {
      counts[violation.severity] += 1
    }
    return {
      totalChecks: this.reports.length,
      totalViolations: this.allViolations.length,
      errors: counts.error,
      warnings: counts.warning,
      infos: counts.info,
      failingChecks: this.failingReports.length,
    }
  }
}

interface ReportSummary {
  totalChecks: number
  totalViolations: number
  errors: number
  warnings: number
  infos: number
  failingChecks: number
}

/** 把任意 string-or-severity 配置覆盖项归一成 SeverityLevel。 */
function resolveSeverityOverride(
  defaultSeverity: SeverityLevel,
  override: unknown
): SeverityLevel {
  if (override === undefined || override === null) return defaultSeverity
  if (override === false) return 'off'
  if (typeof override === 'string') return coerceSeverity(override, defaultSeverity)
  if (typeof override === 'object') {
    const record = override as { severity?: unknown }
    if (record.severity !== undefined) return coerceSeverity(record.severity, defaultSeverity)
  }
  return defaultSeverity
}

export { CheckReport, CheckReportSection, ReportAggregate, resolveSeverityOverride }
export type { ReportSummary }
