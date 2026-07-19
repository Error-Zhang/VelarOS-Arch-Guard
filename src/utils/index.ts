export { collectFiles, findProjectRoot } from './fs'
export { compileGlob, matchesAnyGlob, matchesGlob } from './glob'
export type { AliasResolverOptions, ImportAlias } from './imports'
export { createAliasResolver, extractImports, getPackageNameFromSpecifier } from './imports'
export { isAbsoluteLikePath, isInsideDirectory, normalizePathSeparators, toRelativePosix } from './paths'
export { replaceModuleSpecifierLiterals } from './replaceModuleSpecifier'
export {
  deleteLineAt,
  escapeRegExp,
  formatShortList,
  kebabToPascalCase,
  shortHash,
  stripCodeComments,
} from './text'
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
} from './ts'
