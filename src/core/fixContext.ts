import { readFileSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'

import { writeFileAtomically } from '../utils/atomicWrite'

import type { ArchGuardLogger } from './logger'

/**
 * 提供给 `ViolationInput.applyFix` 的最小 IO 面：统一走仓库根相对路径，写盘原子化。
 */
interface FixContext {
  readonly rootDir: string
  readonly log: ArchGuardLogger
  /** `rootDir` + 相对 POSIX 路径 → 绝对路径。 */
  resolveFile(relativePosix: string): string
  readTextFile(relativePosix: string): string
  writeTextFile(relativePosix: string, content: string): void
  /**
   * 替换文本区间。默认保留区间开头的空白/注释 trivia，避免 AST fixer 使用
   * getFullStart() 时把 `&& typeof …` 修成 `&& isString(…)` 这类表达式拼接问题。
   */
  replaceTextRange(
    relativePosix: string,
    range: TextReplacementRange,
    replacement: string,
    options?: TextReplacementOptions
  ): void
}

interface TextReplacementRange {
  start: number
  end: number
}

interface TextReplacementOptions {
  /** 默认 true；删除类 fix 可显式传 false。 */
  preserveLeadingTrivia?: boolean
}

function createFixContext(rootDir: string, log: ArchGuardLogger): FixContext {
  const absoluteRoot = resolve(rootDir)
  return {
    rootDir: absoluteRoot,
    log,
    resolveFile(relativePosix: string): string {
      return resolveWithinRoot(absoluteRoot, relativePosix)
    },
    readTextFile(relativePosix: string): string {
      return readFileSync(resolveWithinRoot(absoluteRoot, relativePosix), 'utf-8')
    },
    writeTextFile(relativePosix: string, content: string): void {
      writeFileAtomically(resolveWithinRoot(absoluteRoot, relativePosix), content)
    },
    replaceTextRange(
      relativePosix: string,
      range: TextReplacementRange,
      replacement: string,
      options: TextReplacementOptions = {}
    ): void {
      const targetPath = resolveWithinRoot(absoluteRoot, relativePosix)
      const text = readFileSync(targetPath, 'utf-8')
      const start = clampOffset(range.start, text.length)
      const end = clampOffset(range.end, text.length)
      const orderedStart = Math.min(start, end)
      const orderedEnd = Math.max(start, end)
      const original = text.slice(orderedStart, orderedEnd)
      const nextReplacement =
        options.preserveLeadingTrivia === false
          ? replacement
          : withPreservedLeadingTrivia(original, replacement)
      writeFileAtomically(
        targetPath,
        `${text.slice(0, orderedStart)}${nextReplacement}${text.slice(orderedEnd)}`
      )
    },
  }
}

function resolveWithinRoot(rootDir: string, relativePath: string): string {
  const targetPath = resolve(rootDir, relativePath)
  const relation = relative(rootDir, targetPath)
  if (relation === '..' || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
    throw new Error(`arch-guard: autofix path escapes rootDir: ${relativePath}`)
  }
  return targetPath
}

function clampOffset(offset: number, max: number): number {
  if (!Number.isFinite(offset)) return 0
  return Math.max(0, Math.min(Math.trunc(offset), max))
}

function withPreservedLeadingTrivia(original: string, replacement: string): string {
  if (!replacement) return replacement
  const leadingTrivia = readLeadingTrivia(original)
  if (!leadingTrivia) return replacement
  return `${leadingTrivia}${replacement.trimStart()}`
}

function readLeadingTrivia(text: string): string {
  let index = 0
  while (index < text.length) {
    const next = readNextTrivia(text, index)
    if (next === index) {
      break
    }
    index = next
  }
  return text.slice(0, index)
}

function readNextTrivia(text: string, index: number): number {
  let cursor = index
  while (cursor < text.length && /\s/.test(text[cursor] ?? '')) {
    cursor += 1
  }
  if (cursor > index) return cursor

  if (text.startsWith('//', index)) {
    const newline = text.indexOf('\n', index + 2)
    return newline === -1 ? text.length : newline + 1
  }

  if (text.startsWith('/*', index)) {
    const close = text.indexOf('*/', index + 2)
    return close === -1 ? text.length : close + 2
  }

  return index
}

export { createFixContext }
export type { FixContext, TextReplacementOptions, TextReplacementRange }
