/**
 * Supported API for authoring arch-guard checks and plugins.
 *
 * This entrypoint intentionally exposes the execution contracts and reusable
 * source-analysis helpers without making the engine's internal file layout a
 * public compatibility promise.
 */
export type {
  Check,
  CheckAppliesTo,
  CheckInput,
  CheckRunContext,
  CheckRunner,
} from './core/defineCheck'
export { defineCheck, isCheck } from './core/defineCheck'
export type { Plugin, PluginInput, PluginValidateContext } from './core/definePlugin'
export { definePlugin } from './core/definePlugin'
export type { FixContext, TextReplacementOptions, TextReplacementRange } from './core/fixContext'
export type { ArchGuardLogger, LogLevel } from './core/logger'
export type { CheckReportSection } from './core/report'

export { collectFiles, findProjectRoot } from './utils/fs'
export { compileGlob, matchesAnyGlob, matchesGlob } from './utils/glob'
export type { AliasResolverOptions, ImportAlias } from './utils/imports'
export { createAliasResolver, extractImports, getPackageNameFromSpecifier } from './utils/imports'
export {
  isAbsoluteLikePath,
  isInsideDirectory,
  normalizePathSeparators,
  toRelativePosix,
} from './utils/paths'
export { replaceModuleSpecifierLiterals } from './utils/replaceModuleSpecifier'
export {
  deleteLineAt,
  escapeRegExp,
  formatShortList,
  kebabToPascalCase,
  shortHash,
  stripCodeComments,
} from './utils/text'
export {
  forEachComment,
  getColumnNumber,
  getLineNumber,
  getPropertyNameText,
  getScriptKindFromFile,
  hasNamedExport,
  isStringLeafExpression,
  normalizeCommentText,
  parseSourceFile,
  unwrapExpression,
} from './utils/ts'
