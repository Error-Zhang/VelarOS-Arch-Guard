import { escapeRegExp } from './text.js';
/**
 * 将源码中 `from` / side-effect `import` / `import()` / `require()` 里的模块路径字面量
 * 从 `fromSpec` 批量替换为 `toSpec`，保留每种写法各自的引号风格。
 *
 * 仅匹配典型 import 语法，不解析 TS；对注释/字符串误伤风险由调用方控制。
 */
function replaceModuleSpecifierLiterals(source, fromSpec, toSpec) {
    if (fromSpec === toSpec)
        return source;
    const re = escapeRegExp(fromSpec);
    let out = source;
    out = out.replace(new RegExp(`(\\bfrom\\s+)(['"])${re}\\2`, 'g'), (_m, prefix, q) => `${prefix}${q}${toSpec}${q}`);
    out = out.replace(new RegExp(`(\\bimport\\s+)(['"])${re}\\2`, 'g'), (_m, prefix, q) => `${prefix}${q}${toSpec}${q}`);
    out = out.replace(new RegExp(`(\\bimport\\s*\\(\\s*)(['"])${re}\\2(\\s*\\))`, 'g'), (_m, prefix, q, tail) => `${prefix}${q}${toSpec}${q}${tail}`);
    out = out.replace(new RegExp(`(\\brequire\\s*\\(\\s*)(['"])${re}\\2(\\s*\\))`, 'g'), (_m, prefix, q, tail) => `${prefix}${q}${toSpec}${q}${tail}`);
    return out;
}
export { replaceModuleSpecifierLiterals };
//# sourceMappingURL=replaceModuleSpecifier.js.map