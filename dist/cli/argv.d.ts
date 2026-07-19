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
declare function toStringArray(value: string | boolean | string[] | undefined): string[];
declare function toBoolean(value: string | boolean | string[] | undefined): boolean;
declare function toString(value: string | boolean | string[] | undefined): string | undefined;
/**
 * CLI：`--no-fix` 优先于 `--fix`；均未传时返回 `undefined`（沿用配置文件 `fix`）。
 */
declare function resolveCliFix(args: ParsedArgs): boolean | undefined;
export { parseArgs, resolveCliFix, toBoolean, toString, toStringArray };
export type { ParsedArgs };
//# sourceMappingURL=argv.d.ts.map