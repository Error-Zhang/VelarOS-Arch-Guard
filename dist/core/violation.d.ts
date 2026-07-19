import type { FixContext } from './fixContext.js';
import type { SeverityLevel } from './severity.js';
/**
 * 单条违规记录。
 *
 * fingerprint 用于 baseline 对齐：同一条违规即使在文件中行号变动，
 * 只要文件、规则 id 和关键内容稳定，就被识别为同一项。
 */
interface Violation {
    ruleId: string;
    checkId: string;
    sectionTitle: string;
    severity: SeverityLevel;
    message: string;
    file?: string;
    line?: number;
    column?: number;
    /**
     * 自动修复阶段：越小越先应用；未设置时视为默认阶段（靠后）。
     * 同阶段内仍按 {@link Violation.fixStartOffset} 从大到小应用。
     */
    fixPhase?: number;
    /** 自动修复顺序：按偏移从大到小应用，避免同文件多次替换错位。 */
    fixStartOffset?: number;
    suggestion?: string;
    fingerprint: string;
    data?: Readonly<Record<string, unknown>>;
    /** 若存在且全局/按规则允许 fix，runner 可在一次 run 内调用以改写源码。 */
    applyFix?: (context: FixContext) => void | Promise<void>;
}
interface ViolationInput {
    ruleId: string;
    message: string;
    file?: string;
    line?: number;
    column?: number;
    /** 越小越先应用；见 {@link Violation.fixPhase}。 */
    fixPhase?: number;
    fixStartOffset?: number;
    suggestion?: string;
    /** 用于 fingerprint hash 的关键内容（如代码片段、特征值）。不传时使用 message。 */
    fingerprintInput?: string;
    data?: Readonly<Record<string, unknown>>;
    applyFix?: (context: FixContext) => void | Promise<void>;
}
/** 生成 fingerprint：稳定的短 hash，用于 baseline 比对。 */
declare function computeFingerprint(parts: ReadonlyArray<string | undefined>): string;
/** 序列化 violation 为 baseline 友好的字符串 key。 */
declare function violationKey(violation: Violation): string;
export { computeFingerprint, violationKey };
export type { Violation, ViolationInput };
//# sourceMappingURL=violation.d.ts.map