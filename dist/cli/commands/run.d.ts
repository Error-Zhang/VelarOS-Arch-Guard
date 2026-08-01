import { type ParsedArgs } from '../argv.js';
/**
 * `arch-guard run`：执行所有（或过滤后）的 checks，按 reporter 输出。
 *
 * 常用 flag：
 *   --config <path>           显式指定配置文件
 *   --root <path>             显式 rootDir
 *   --only <id>               只跑指定 id（可重复）
 *   --skip <id>               跳过指定 id（可重复）
 *   --tag <tag>               按 tag 过滤（可重复）
 *   --file <path>             只检查指定文件 / 目录 / glob（可重复）
 *   --changed                 只检查当前 git diff + 未跟踪文件
 *   --staged                  只检查暂存区文件
 *   --format stylish|json|sarif|github  选择 reporter（可重复，多 reporter 串联）
 *   --out <path>              json/sarif 输出文件
 *   --no-baseline             忽略 baseline 文件
 *   --fix                     对支持自动修复的违规尝试修复（覆盖配置里的 fix；见 README）
 *   --no-fix                  关闭自动修复（覆盖配置里的 fix: true）
 *   --baseline-path <path>    自定义 baseline 文件
 *   --fail-on-stale           基线里有已修好却没退役的条目时判失败
 *   --log-level error|warn|info|debug
 *
 * **`run` 不写 baseline**。0.2.x 时它默认 `pruneStaleBaseline: true`——跑一次报告就把指纹失配的
 * 冻结条目删掉并回写，于是「跑完就绿、`git checkout` 基线又红」的假绿会常态化，而且消费方把
 * `run` 接进全链质量门时，等于门自己在改棘轮。收缩基线现在只有一个显式入口：
 * `arch-guard baseline prune`。`--no-prune-stale-baseline` 仍可传，但已是空操作。
 */
declare function runCommand(args: ParsedArgs): Promise<number>;
export { runCommand };
//# sourceMappingURL=run.d.ts.map