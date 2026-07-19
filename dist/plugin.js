export { defineCheck, isCheck } from './core/defineCheck.js';
export { definePlugin } from './core/definePlugin.js';
export { collectFiles, findProjectRoot } from './utils/fs.js';
export { compileGlob, matchesAnyGlob, matchesGlob } from './utils/glob.js';
export { createAliasResolver, extractImports, getPackageNameFromSpecifier } from './utils/imports.js';
export { isAbsoluteLikePath, isInsideDirectory, normalizePathSeparators, toRelativePosix, } from './utils/paths.js';
export { replaceModuleSpecifierLiterals } from './utils/replaceModuleSpecifier.js';
export { deleteLineAt, escapeRegExp, formatShortList, kebabToPascalCase, shortHash, stripCodeComments, } from './utils/text.js';
export { forEachComment, getColumnNumber, getLineNumber, getPropertyNameText, getScriptKindFromFile, hasNamedExport, isStringLeafExpression, normalizeCommentText, parseSourceFile, unwrapExpression, } from './utils/ts.js';
//# sourceMappingURL=plugin.js.map