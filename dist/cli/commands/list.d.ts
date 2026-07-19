import { type ParsedArgs } from '../argv.js';
/**
 * `arch-guard list`：列出当前配置激活的所有 checks。
 *
 * 输出模式：
 *   - 默认：human-readable，按 id 顺序展开 title/tags/severity/description/verifies。
 *   - `--by-tag`：按 tag 分组，便于看清规则覆盖的领域分布。
 *   - `--json`：机器可读，AI agent / CI 解析友好。
 *   - `--ids-only`：只打印 id 列表，每行一个，方便管道。
 */
declare function listCommand(args: ParsedArgs): Promise<number>;
export { listCommand };
//# sourceMappingURL=list.d.ts.map