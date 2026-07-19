import type { Reporter } from './types.js';
interface SarifReporterOptions {
    out?: string;
    toolName?: string;
    toolVersion?: string;
    informationUri?: string;
}
/**
 * SARIF 2.1.0 reporter，可用于 GitHub Code Scanning 上传。
 *
 * 仅生成最常用的 result/rule/location 结构，足以让 PR diff 出现行内告警。
 */
declare function sarifReporter(options?: SarifReporterOptions): Reporter;
export { sarifReporter };
export type { SarifReporterOptions };
//# sourceMappingURL=sarif.d.ts.map