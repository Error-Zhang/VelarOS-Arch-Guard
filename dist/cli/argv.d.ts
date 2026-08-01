interface ParsedArgs {
    command: string;
    positionals: string[];
    options: Record<string, string | boolean | string[]>;
}
/**
 * 极简 argv 解析器（零依赖）。
 *
 * 支持：
 *   - `--flag` → true
 *   - `--key value`
 *   - `--key=value`
 *   - 重复出现的 `--only x --only y` → string[]
 *
 * 第一个非 option 视为 command，其余为 positional。
 */
declare function parseArgs(argv: readonly string[]): ParsedArgs;
/**
 * CLI 认识的全部长选项。
 *
 * 解析器天生宽容：`--dryrun` 会被记成一个谁也不读的 key，然后**静默**丢掉。而 `--dry-run`
 * 是撤回写意图的唯一机制——一个拼写错误就能让它失效，命令照常写盘，什么都不报。
 * 未知选项一律当错误：把「我以为我传了」和「它真的生效了」这两件事重新绑在一起。
 *
 * 新增 flag 必须同步进这张表，否则自己的 CLI 会拒绝自己（这正是想要的提醒）。
 */
declare const KnownOptions: ReadonlySet<string>;
/** 未知选项及其最相近的建议（没有相近项时 `suggestion` 为 undefined）。 */
interface UnknownOption {
    key: string;
    suggestion: string | undefined;
}
/**
 * 找出 argv 里所有 CLI 不认识的长选项。
 *
 * 建议只做一件事：把连字符抹平再比。`--dryrun` / `--dry_run` / `--dryRun` 都会指回
 * `--dry-run`，而这正是最容易也最贵的那一类手滑。
 */
declare function findUnknownOptions(args: ParsedArgs): UnknownOption[];
declare function toStringArray(value: string | boolean | string[] | undefined): string[];
declare function toBoolean(value: string | boolean | string[] | undefined): boolean;
declare function toString(value: string | boolean | string[] | undefined): string | undefined;
/**
 * CLI：`--no-fix` 优先于 `--fix`；均未传时返回 `undefined`（沿用配置文件 `fix`）。
 */
declare function resolveCliFix(args: ParsedArgs): boolean | undefined;
export { findUnknownOptions, KnownOptions, parseArgs, resolveCliFix, toBoolean, toString, toStringArray };
export type { ParsedArgs, UnknownOption };
//# sourceMappingURL=argv.d.ts.map