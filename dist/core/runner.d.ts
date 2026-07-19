import type { ResolvedConfig } from '../config/types.js';
import type { Reporter } from '../reporters/types.js';
import { type Baseline } from './baseline.js';
import type { Check } from './defineCheck.js';
import { type CheckFilterInput } from './filter.js';
import { type LogLevel } from './logger.js';
import { ReportAggregate } from './report.js';
import type { SeverityLevel } from './severity.js';
/**
 * Runner 选项。
 *
 * 由 CLI 或编程入口构造，把配置 + 过滤器 + reporter + baseline 路径传进来。
 */
interface RunOptions {
    config: ResolvedConfig;
    filter?: CheckFilterInput;
    reporters: readonly Reporter[];
    logLevel?: LogLevel;
    baselinePath?: string;
    /** 调用方覆盖：忽略 baseline（用于 --no-baseline 模式或 baseline:update）。 */
    ignoreBaseline?: boolean;
    /** 是否打印 baseline 失效条目提醒。默认 true。 */
    warnStaleBaseline?: boolean;
    /** 完整运行时是否自动移除已经不再命中的 baseline 条目。 */
    pruneStaleBaseline?: boolean;
    /**
     * 是否对带 `Violation.applyFix` 的违规尝试自动修复。
     * `true`/`false` 覆盖配置文件 `fix`；省略则使用 `config.fix`（默认 false）。
     */
    fix?: boolean;
    /** 本次 run 是否只覆盖部分文件；用于避免误判 baseline stale。 */
    fileScopeActive?: boolean;
    /** 自动修复后重复检查的最大轮数（防抖动）。默认 25。 */
    maxFixIterations?: number;
}
/**
 * 单次 run 的产出。
 *
 * `exitCode` 给 CLI 用，0 表示成功，1 表示有 failing violations。
 * `aggregate` 给编程入口 / 编辑器集成用。
 */
interface RunResult {
    aggregate: ReportAggregate;
    baseline?: Baseline;
    exitCode: number;
}
/**
 * 主调度函数。
 *
 * 流程：
 *  1. 合并 plugin checks + filter，得到本次要跑的 checks
 *  2. 为每个 check 计算有效 severity（config.rules 覆盖 defaultSeverity）
 *  3. 构造共享 context，串行调用 check.run
 *  4. baseline 过滤、（可选）多轮 applyFix + 复跑、reporter 输出、exitCode 判定
 *
 * 串行执行的理由：单仓库规模下文件 IO 和 AST 解析已经被 SharedCache 复用，
 * 并行带来的复杂度（错误聚合、stdout 顺序）目前不值得引入。后续可加 workerPool。
 */
declare function runArchGuard(options: RunOptions): Promise<RunResult>;
declare function collectAllChecks(config: ResolvedConfig): Check[];
declare function effectiveSeverity(check: Check, config: ResolvedConfig): SeverityLevel;
declare function resolveBaselinePath(rootDir: string, override?: string): string;
export { collectAllChecks, effectiveSeverity, resolveBaselinePath, runArchGuard };
export type { RunOptions, RunResult };
//# sourceMappingURL=runner.d.ts.map