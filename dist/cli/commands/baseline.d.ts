import { type ParsedArgs } from '../argv.js';
/**
 * `arch-guard baseline <action>`：
 *
 *   update  — 跑一遍所有 checks，把全部违规写入 baseline 文件。
 *   check   — 仅校验现有 baseline 是否完整匹配（不写盘）。
 */
declare function baselineCommand(args: ParsedArgs): Promise<number>;
export { baselineCommand };
//# sourceMappingURL=baseline.d.ts.map