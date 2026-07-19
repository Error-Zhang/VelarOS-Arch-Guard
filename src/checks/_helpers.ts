import { extname } from 'node:path'

import type { CheckRunContext } from '../core/defineCheck'
import { toRelativePosix } from '../utils/paths'

/**
 * 内部规则统一的源文件收集器。
 *
 * 规则可以声明 `options.sources` 来指定关心的文件后缀，缺省覆盖 TS/JS 全套。
 * 同时支持 include/exclude glob，由共享 FileCollections 完成。
 */
function collectSourceFilesForCheck(
  context: CheckRunContext,
  options: {
    roots?: readonly string[]
    extensions?: readonly string[]
    include?: readonly string[]
    exclude?: readonly string[]
  }
): string[] {
  const roots = options.roots ?? ['src', 'packages', 'scripts']
  const extensions = new Set(options.extensions ?? ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.jsx'])
  const collected = context.files.collect(roots, extensions)
  if (!options.include && !options.exclude) return collected
  return context.files.filter(collected, options.include, options.exclude)
}

/** 读取文件名扩展名（小写、含点）。 */
function fileExt(filePath: string): string {
  return extname(filePath).toLowerCase()
}

/** 把绝对路径转换为以 rootDir 为基准的相对路径，常用于消息输出。 */
function rel(context: CheckRunContext, filePath: string): string {
  return toRelativePosix(context.rootDir, filePath)
}

/** 读取规则 option：默认值兜底 + 简单类型守卫。 */
function readOption<T>(
  context: CheckRunContext,
  key: string,
  defaultValue: T,
  isValid: (value: unknown) => value is T
): T {
  const value = context.options[key]
  return isValid(value) ? value : defaultValue
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isStringRecord(value: unknown): value is Readonly<Record<string, string>> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((item) => typeof item === 'string')
  )
}

export { collectSourceFilesForCheck, fileExt, isStringArray, isStringRecord, readOption, rel }
