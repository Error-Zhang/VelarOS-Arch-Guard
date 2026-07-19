/**
 * 将源码中 `from` / side-effect `import` / `import()` / `require()` 里的模块路径字面量
 * 从 `fromSpec` 批量替换为 `toSpec`，保留每种写法各自的引号风格。
 *
 * 仅匹配典型 import 语法，不解析 TS；对注释/字符串误伤风险由调用方控制。
 */
declare function replaceModuleSpecifierLiterals(source: string, fromSpec: string, toSpec: string): string;
export { replaceModuleSpecifierLiterals };
//# sourceMappingURL=replaceModuleSpecifier.d.ts.map