import type { ResolvedConfig } from '../config/types.js';
import { type ParsedArgs } from './argv.js';
interface CliFileScopeResult {
    config: ResolvedConfig;
    /** 本次运行是否被收窄到部分文件。 */
    active: boolean;
    files: string[];
    /**
     * 用户**是否要求过**文件作用域（`--file` / 裸 positional / `--changed` / `--diff` / `--staged`）。
     *
     * 与 `active` 分开：`--changed` 的 diff 里一个 `.ts/.tsx/.js/.mjs` 都没有时 `files` 为空，
     * 旧实现于是回落成 `active:false`＝**全仓**。读命令因此扫了全仓，写命令（`baseline update`）
     * 更糟——直接走无作用域分支，把整仓当前违规重冻一遍。「我只想动这几个文件」静默变成
     * 「重写整条棘轮」，是这一批要消灭的那类隐式行为里最贵的一个。
     */
    requested: boolean;
    /** 要求了作用域，但解析下来一个可扫文件都没有。 */
    empty: boolean;
    /** 用户要求作用域时给出的原始实参，用于把「为什么是空的」讲清楚。 */
    requestedInputs: string[];
}
declare function applyCliFileScope(config: ResolvedConfig, args: ParsedArgs): CliFileScopeResult;
/**
 * 「要求了作用域，但一个可扫文件都没有」的一句话说明；不是这种情况时返回 `undefined`。
 *
 * **写**命令拿它当拒绝理由：什么都不做，基线一个字节不碰。
 * **读**命令（`run` / `verify` / `baseline check`）拿它当告示——「扫了零个文件」和
 * 「扫完了没问题」必须可分辨，否则 `verify --changed` 在一个只改了 .md 的分支上打出
 * `PASS`，读的人有充分理由以为代码被检查过了。
 *
 * 读命令**不因此短路**：不读文件扫描面的 check（docs 索引、package.json 契约、i18n、
 * 遗留 .mjs 巨石）照样报全量违规，跳过它们等于让门变松。告示只加信息，不改判定。
 */
declare function describeEmptyFileScope(scope: CliFileScopeResult): string | undefined;
export { applyCliFileScope, describeEmptyFileScope };
export type { CliFileScopeResult };
//# sourceMappingURL=fileScope.d.ts.map