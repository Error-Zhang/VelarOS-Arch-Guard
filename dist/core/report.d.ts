import type { Check } from './defineCheck.js';
import { type SeverityLevel } from './severity.js';
import { type Violation, type ViolationInput } from './violation.js';
/**
 * 单个 check 在一次执行中的报告。
 *
 * 通过 `report.section('xxx')` 把同一个 check 内部的不同违规类型分桶展示。
 * 引擎在 runner 中创建并传给 check.run；check 不直接构造 Report。
 */
declare class CheckReport {
    readonly check: Check;
    readonly sections: Map<string, CheckReportSection>;
    /** 由 runner 注入的有效严重级别（已经合并 config 覆盖）。 */
    effectiveSeverity: SeverityLevel;
    constructor(check: Check, effectiveSeverity: SeverityLevel);
    /** 获取（或创建）一个 section。同名 section 会被合并。 */
    section(title: string): CheckReportSection;
    /** 简易模式：直接添加到 "General" section。 */
    add(input: ViolationInput | string): void;
    /** 所有 section 的违规扁平列表。 */
    get violations(): Violation[];
    get hasViolations(): boolean;
    /** 是否触发 CI 失败：取决于本 check 的有效严重级别 + 是否有违规。 */
    get hasFailures(): boolean;
    get failedSections(): CheckReportSection[];
}
/**
 * Report 内部按职责分组的违规桶。
 *
 * 每个 section 表示同一个 check 内部的一类违规（如 "Layer boundaries"、"Database access"），
 * 输出时按 section 分块，便于阅读和 baseline 维护。
 */
declare class CheckReportSection {
    readonly report: CheckReport;
    readonly title: string;
    readonly violations: Violation[];
    constructor(report: CheckReport, title: string);
    /** 添加一条违规；接受字符串简写或完整 ViolationInput。 */
    add(input: ViolationInput | string): Violation;
    /** 批量添加。 */
    addAll(inputs: ReadonlyArray<ViolationInput | string>): Violation[];
    private materialize;
}
/** 聚合多个 CheckReport 的总结果。 */
declare class ReportAggregate {
    readonly reports: CheckReport[];
    add(report: CheckReport): void;
    get allViolations(): Violation[];
    get failingReports(): CheckReport[];
    get hasFailures(): boolean;
    summary(): ReportSummary;
}
interface ReportSummary {
    totalChecks: number;
    totalViolations: number;
    errors: number;
    warnings: number;
    infos: number;
    failingChecks: number;
}
/** 把任意 string-or-severity 配置覆盖项归一成 SeverityLevel。 */
declare function resolveSeverityOverride(defaultSeverity: SeverityLevel, override: unknown): SeverityLevel;
export { CheckReport, CheckReportSection, ReportAggregate, resolveSeverityOverride };
export type { ReportSummary };
//# sourceMappingURL=report.d.ts.map