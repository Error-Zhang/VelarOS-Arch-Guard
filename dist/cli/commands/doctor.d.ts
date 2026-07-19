import { type ParsedArgs } from '../argv.js';
/**
 * `arch-guard doctor`：配置健康检查。
 *
 * - 找不到配置文件时报警但不失败。
 * - 校验 plugin 列表中的每个 plugin.validate（如果定义）。
 * - 校验 check id 是否唯一。
 * - 校验 rules 中引用的 check id 是否真实存在。
 */
declare function doctorCommand(args: ParsedArgs): Promise<number>;
export { doctorCommand };
//# sourceMappingURL=doctor.d.ts.map