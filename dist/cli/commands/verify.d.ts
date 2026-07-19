import { type ParsedArgs } from '../argv.js';
/**
 * `arch-guard verify`：CI / AI agent 友好的短输出。
 *
 * 默认只打一行总结到 stdout，让自动化工具方便判断成败：
 *   stdout: `arch-guard: PASS (14 checks)` 或 `arch-guard: FAIL — 3/14 checks failing, 222 violations.`
 *   exit code: 0 表示成功，1 表示有 failing checks，2 表示运行时错误
 *
 * 加 `--json` 会输出结构化结果，包含每个 check 的违规数、severity 分布、failing checks 列表：
 *   { "ok": false, "exitCode": 1, "summary": {...}, "failing": [{ id, violations, sections }] }
 *
 * 与 `run` 的区别：verify 不打印每条违规，只产出"通过/失败 + 概览"，适合：
 *   - CI 主流程（只需判定 PR 是否通过）
 *   - AI agent 自我验证（不消耗大量 token 读违规明细）
 *   - 在更大的 check pipeline 里只关心结果
 */
declare function verifyCommand(args: ParsedArgs): Promise<number>;
export { verifyCommand };
//# sourceMappingURL=verify.d.ts.map