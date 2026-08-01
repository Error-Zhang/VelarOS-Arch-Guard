import type { CheckRunContext } from '../../core/defineCheck.js';
import ts from 'typescript';
/**
 * code-style 规则集共享基础设施。
 *
 * 这里收纳所有 code-style 子规则都会用到的：
 *  - 标准文件过滤集合（生成物 / 测试 / 夹具 / `.d.ts` 一律不扫）
 *  - 扫描面分档（runtime 源码根、前端根、便携库豁免），**全部来自 check options**
 *  - 共享 AST 缓存（通过 context.cache.memo 复用一次解析）
 *  - 工具函数：relative path、行号、字面量识别等
 *
 * **与宿主仓库解耦**：本模块不认识任何具体仓库的目录名。消费方通过 check options
 * （见 {@link readCodeStyleScope}）注入自己的 `runtimeRoots` / `frontendRoots` 等；
 * 一律不传时退化为「配置 `files.roots` 内的全部 TS/TSX」。
 */
/** 任何项目都不该被 code-style 扫描的文件（生成物 / 测试 / 夹具 / 类型声明）。 */
declare const DefaultSkipPatterns: readonly RegExp[];
/**
 * 从 check options 解析出的扫描面。
 *
 * 缺席即「不过滤」：只声明自己关心的那一档，其余交给 arch-guard 配置的 `files` 作用域。
 */
interface CodeStyleScope {
    /** 收集起点（相对 rootDir）。默认 `['.']`，与配置 `files.roots` 取交集。 */
    scanRoots: readonly string[];
    /** 被视为「运行时业务代码」的根；空数组表示不按根过滤。 */
    runtimeRoots: readonly string[];
    /** 前端 / 渲染层根；空数组表示不按根过滤。 */
    frontendRoots: readonly string[];
    /** 整体豁免的便携库前缀（如工具包自身）。 */
    portableLibraryPrefixes: readonly string[];
    /** 追加跳过 pattern（正则源串）。 */
    extraSkipPatterns: readonly RegExp[];
    /** 单条规则的文件级豁免（精确相对路径）。 */
    allowFiles: ReadonlySet<string>;
}
interface CollectCodeStyleFilesOptions {
    /** 默认会跳过 test/generated 等。设 true 则不再跳过这些（用于中文注释扫描全部 .ts）。 */
    includeAuxiliary?: boolean;
    /** 默认会跳过便携库前缀。设 false 则不豁免。 */
    excludePortableLibraries?: boolean;
    /** 限定到 `runtimeRoots` 内（默认 true；该项为空时等价于不过滤）。 */
    runtimeOnly?: boolean;
    /** 限定到 `frontendRoots`（默认 false；该项为空时等价于不过滤）。 */
    frontendOnly?: boolean;
    /** 额外的跳过 pattern。 */
    extraSkipPatterns?: readonly RegExp[];
}
interface SourceFileInfo {
    absolutePath: string;
    relativePath: string;
    sourceFile: ts.SourceFile;
}
/** 把 check options 读成扫描面；缺项一律退化为「不过滤」。 */
declare function readCodeStyleScope(context: CheckRunContext): CodeStyleScope;
/**
 * 收集 code-style 检查关心的 TS/TSX 文件清单。
 *
 * 走 context.files.collect（命中 shared cache），再按 options 声明的根过滤。
 * 返回的相对路径都是 normalized posix 风格，方便和正则对账。
 */
declare function collectCodeStyleFiles(context: CheckRunContext, options?: CollectCodeStyleFilesOptions): Array<{
    absolutePath: string;
    relativePath: string;
}>;
/** 收集「扫描注释语言」用的源文件——比 runtime 宽，不按运行时根收窄。 */
declare function collectChineseTextFiles(context: CheckRunContext): Array<{
    absolutePath: string;
    relativePath: string;
}>;
/** 解析或复用 AST（按 absolute path 跨 check 缓存）。 */
declare function getCachedSourceFile(context: CheckRunContext, info: {
    absolutePath: string;
}): ts.SourceFile;
/** 把绝对路径转 root-relative 的 posix 字符串。 */
declare function toRelative(context: CheckRunContext, absolutePath: string): string;
/** 该文件是否落在 options 声明的前端根内（未声明前端根时恒为 true）。 */
declare function isFrontendFile(context: CheckRunContext, relativePath: string): boolean;
/** 取节点首行（1-based）。 */
declare function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number;
/** 节点首列（1-based）。 */
declare function columnOf(sourceFile: ts.SourceFile, node: ts.Node): number;
/** 取节点源文本（截断到 max 字符，便于错误信息）。 */
declare function snippetOf(sourceFile: ts.SourceFile, node: ts.Node, max?: number): string;
declare function unwrapParensExpression(expr: ts.Expression): ts.Expression;
/** 自条件子式向上：找到以该子式（去括号后）为 **整段 condition** 的三元。 */
declare function enclosingConditionalIfDirectCondition(expr: ts.Node): ts.ConditionalExpression | undefined;
/** 遍历整棵 AST，对每个节点回调 visitor。 */
declare function walk(node: ts.Node, visitor: (n: ts.Node) => void): void;
export { collectChineseTextFiles, collectCodeStyleFiles, columnOf, DefaultSkipPatterns, enclosingConditionalIfDirectCondition, getCachedSourceFile, isFrontendFile, lineOf, readCodeStyleScope, snippetOf, toRelative, unwrapParensExpression, walk, };
export type { CodeStyleScope, CollectCodeStyleFilesOptions, SourceFileInfo };
//# sourceMappingURL=_shared.d.ts.map