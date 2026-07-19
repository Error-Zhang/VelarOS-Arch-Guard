import type { Reporter } from './types.js';
interface JsonReporterOptions {
    /** 写出文件路径（相对 rootDir 或绝对路径），不传时打印到 stdout。 */
    out?: string;
}
/** JSON reporter，便于 CI / IDE / 其它工具消费。 */
declare function jsonReporter(options?: JsonReporterOptions): Reporter;
export { jsonReporter };
export type { JsonReporterOptions };
//# sourceMappingURL=json.d.ts.map