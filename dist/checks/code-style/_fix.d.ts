import type { CheckRunContext } from '../../core/defineCheck.js';
import type { FixContext } from '../../core/fixContext.js';
/**
 * code-style 修复器的共享落点。
 *
 * 这一族规则原本各自持有一份逐字节相同的 `fixReplaceText` / `fixReplaceRange`，且**都只改表达式、
 * 不管 import**。19 条可 autofix 的规则里有 15 条会吐出 `isString` / `isEmpty` / `optionalWhen`
 * 这类具名原语，`--fix` 之后文件里并没有这些名字，于是 `TS2304` 叠加 `TS2322`（未解析标识符不
 * 携带类型谓词，窄化整体塌掉）。这里把替换和「补 import」并成同一个动作，规则只需说明
 * 「我引入了哪些名字」——由 {@link HelperPrimitiveNames} 从替换文本里机械识别。
 */
/** 这一族规则可能吐出的原语。补 import 时只认这张表，避免误伤用户标识符。 */
declare const HelperPrimitiveNames: readonly string[];
/**
 * 原语的导入来源。
 *
 * 由 check options 注入（`helperImportModule` / `helperImportModuleBySymbol`）：这些原语住哪个包
 * 是**消费方**的事，规则集不认识任何具体包名。
 *
 * **没配来源时不再默默改盘**。0.3.0 的第一版把「没配 = 不补 import」当成向后兼容，结果是两个
 * 消费仓都没配（升级步骤里也没提这一步），于是 `--fix` 一次引入几百个未解析标识符、什么都不打印。
 * 静默写出不编译的代码是最坏的一档；宿主真的把这些原语注入成全局时用
 * `helpers: { assumeGlobals: true }` 明说。
 */
interface HelperImportSources {
    module: string;
    bySymbol: Readonly<Record<string, string>>;
    /** 宿主声明这些原语是全局可见的：不补 import，也不因此拒绝修复。 */
    assumeGlobals: boolean;
}
declare const NoHelperImports: HelperImportSources;
/** 从 check options 读出原语来源。 */
declare function readHelperImportSources(context: CheckRunContext): HelperImportSources;
/** 单个原语的来源模块；没有配置时返回空串。 */
declare function moduleForHelper(sources: HelperImportSources, name: string): string;
/** 某个原语这次该怎么处理 import。 */
type HelperImportResolution = {
    kind: 'globals';
} | {
    kind: 'module';
    module: string;
} | {
    kind: 'unconfigured';
};
declare function resolveHelperImport(sources: HelperImportSources, name: string): HelperImportResolution;
declare function helpersIntroducedBy(replacement: string): string[];
/** 排给引擎的一次修复：替换 + 需要补的 import。 */
interface ScheduledFix {
    applyFix: (ctx: FixContext) => void;
    fixStartOffset: number;
}
interface ReplaceSpanInput {
    relativePath: string;
    start: number;
    end: number;
    replacement: string;
    helpers: HelperImportSources;
    /**
     * true 时走 {@link FixContext.replaceTextRange}（保留区间开头的空白 / 注释 trivia），
     * 用于以 `getFullStart()` 取区间的 fixer。默认 false = 纯切片。
     */
    preserveLeadingTrivia?: boolean;
}
/**
 * 生成一次「替换 + 补 import」的修复。
 *
 * **先判后写**：所有要引入的名字都先过一遍 {@link FixContext.planNamedImport}，任何一个
 * 判不了（没配来源 / 那个位置这个名字已经被别的东西绑走了）就整次修复放弃、抛出理由，
 * 文件一个字节都不动。`--fix` 只有两种结局：写出能编译的代码，或者什么都不写并明说。
 *
 * import 不在这里写盘：见 {@link FixContext.requireNamedImport}，由引擎在本轮替换全部落盘后 flush。
 */
declare function fixReplaceSpan(input: ReplaceSpanInput): ScheduledFix;
export { fixReplaceSpan, HelperPrimitiveNames, helpersIntroducedBy, moduleForHelper, NoHelperImports, readHelperImportSources, resolveHelperImport, };
export type { HelperImportResolution, HelperImportSources, ReplaceSpanInput, ScheduledFix };
//# sourceMappingURL=_fix.d.ts.map