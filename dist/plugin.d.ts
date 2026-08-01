/**
 * Supported API for authoring arch-guard checks and plugins.
 *
 * This entrypoint intentionally exposes the execution contracts and reusable
 * source-analysis helpers without making the engine's internal file layout a
 * public compatibility promise.
 */
export type { Check, CheckAppliesTo, CheckInput, CheckRunContext, CheckRunner, } from './core/defineCheck.js';
export { defineCheck, isCheck } from './core/defineCheck.js';
export type { Plugin, PluginInput, PluginValidateContext } from './core/definePlugin.js';
export { definePlugin } from './core/definePlugin.js';
export type { FixContext, NamedImportPlan, TextReplacementOptions, TextReplacementRange } from './core/fixContext.js';
export type { ArchGuardLogger, LogLevel } from './core/logger.js';
export type { CheckReportSection } from './core/report.js';
export { collectFiles, findProjectRoot } from './utils/fs.js';
export { compileGlob, matchesAnyGlob, matchesGlob } from './utils/glob.js';
export type { AliasResolverOptions, ImportAlias } from './utils/imports.js';
export { createAliasResolver, extractImports, getPackageNameFromSpecifier } from './utils/imports.js';
export { isAbsoluteLikePath, isInsideDirectory, normalizePathSeparators, toRelativePosix, } from './utils/paths.js';
export { replaceModuleSpecifierLiterals } from './utils/replaceModuleSpecifier.js';
export { deleteLineAt, escapeRegExp, formatShortList, kebabToPascalCase, shortHash, stripCodeComments, } from './utils/text.js';
export { forEachComment, getColumnNumber, getLineNumber, getPropertyNameText, getScriptKindFromFile, hasNamedExport, isStringLeafExpression, normalizeCommentText, parseSourceFile, unwrapExpression, } from './utils/ts.js';
//# sourceMappingURL=plugin.d.ts.map