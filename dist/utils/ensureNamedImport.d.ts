/**
 * 往源码里补一条具名 import——autofix 的缺失环节。
 *
 * 修复器一律做纯字节切片替换，于是把 `typeof x === 'string'` 改成 `isString(x)` 之后，
 * 文件里并没有 `isString` 这个名字。后果是两档级联：`TS2304`（找不到名字），以及
 * `TS2322`——未解析的标识符不携带类型谓词，原本靠裸 `typeof` 完成的窄化整体塌掉，
 * 报错数比缺失的 import 还多，很容易把人引向「窄化写法要改」的错误结论。
 *
 * 本模块做两件事：
 *  1. {@link planNamedImportInSource} —— 在**改盘之前**判断这个名字在修复点到底能不能用；
 *  2. {@link ensureNamedImportInSource} —— **幂等**地保证 `import { name } from 'module'` 存在。
 *
 * 判断必须带作用域与模块身份。「全文件扫一遍有没有同名绑定，有就不补」这种口径会在三个方向
 * 上写出编译不过的代码：不相干函数里的局部同名变量挡掉顶层用法的 import；**别的模块**导入的
 * 同名符号挡掉它、于是修复把守卫悄悄接到了外来函数上；函数参数根本不在检查面内，import 补了
 * 又在被修的那个函数里被遮蔽。做不到确定就不补——而且连这次替换一起放弃，宁可什么都不写。
 */
interface EnsureNamedImportResult {
    /** 处理后的源码。未改动时与入参同一个字符串。 */
    text: string;
    changed: boolean;
    /** 非空表示拒绝插入（名字在该文件顶层已被别的东西占着），调用方应当报出来。 */
    blocked?: string;
}
/** 修复点上这个名字的处置方案。 */
type NamedImportPlan = {
    kind: 'satisfied';
} | {
    kind: 'insert';
} | {
    kind: 'blocked';
    reason: string;
};
/**
 * 判断在 `atOffset` 处引入 `importName` 是否安全。
 *
 * - `satisfied`：该位置解析到的就是同模块的值 import，什么都不用做。
 * - `insert`：该位置这个名字是自由的，补一条顶层 import 即可。
 * - `blocked`：该位置这个名字已经被别的东西绑走了（顶层的同名声明 / 来自别的模块的同名导入 /
 *   把顶层 import 遮蔽掉的内层变量或参数）。此时**整次修复都要放弃**。
 */
declare function planNamedImportInSource(filePath: string, source: string, moduleSpecifier: string, importName: string, atOffset: number): NamedImportPlan;
declare function ensureNamedImportInSource(filePath: string, source: string, moduleSpecifier: string, importName: string): EnsureNamedImportResult;
export { ensureNamedImportInSource, planNamedImportInSource };
export type { EnsureNamedImportResult, NamedImportPlan };
//# sourceMappingURL=ensureNamedImport.d.ts.map