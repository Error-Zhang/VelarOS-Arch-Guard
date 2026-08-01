import { readFileSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'

import { writeFileAtomically } from '../utils/atomicWrite'
import {
  ensureNamedImportInSource,
  type NamedImportPlan,
  planNamedImportInSource,
} from '../utils/ensureNamedImport'

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
  /**
   * 声明「这次改写引入了 `importName` 这个名字，它来自 `moduleSpecifier`」。
   *
   * **不立刻写盘**：import 插在文件头部会把后续所有 offset 顶掉，而同一轮里其它 fixer
   * 拿的还是本轮解析时的 offset。请求会攒起来，由引擎在**本轮全部区间替换落盘之后**统一 flush，
   * flush 时重新读盘、幂等去重。
   */
  requireNamedImport(relativePosix: string, moduleSpecifier: string, importName: string): void
  /**
   * 改盘**之前**问一句：在 `atOffset` 处引入 `importName` 安不安全。
   *
   * `satisfied` = 那个位置解析到的已经是同模块的值 import；`insert` = 名字自由，补一条即可；
   * `blocked` = 名字被别的东西绑走了（顶层同名声明、别的模块的同名导入、遮蔽顶层的内层变量
   * 或参数）。拿到 `blocked` 的 fixer 应当**放弃整次修复**：补不上 import 就别改表达式，
   * 否则写出的是 `TS2304` + `TS2322` 级联，或者更糟——悄悄接到了另一个同名函数上。
   */
  planNamedImport(
    relativePosix: string,
    moduleSpecifier: string,
    importName: string,
    atOffset: number
  ): NamedImportPlan
}

/** 引擎内部使用的 FixContext 面：多出一个 flush 钩子。 */
interface InternalFixContext extends FixContext {
  /** 落盘所有攒起来的 import 请求，返回实际改动的文件数。 */
  flushPendingImports(): number
}

interface TextReplacementRange {
  start: number
  end: number
}

interface TextReplacementOptions {
  /** 默认 true；删除类 fix 可显式传 false。 */
  preserveLeadingTrivia?: boolean
}

function createFixContext(rootDir: string, log: ArchGuardLogger): InternalFixContext {
  const absoluteRoot = resolve(rootDir)
  /** `relativePosix` → `moduleSpecifier` → 名字集合。 */
  const pendingImports = new Map<string, Map<string, Set<string>>>()

  return {
    rootDir: absoluteRoot,
    log,
    requireNamedImport(relativePosix: string, moduleSpecifier: string, importName: string): void {
      if (!moduleSpecifier || !importName) return
      const byModule = pendingImports.get(relativePosix) ?? new Map<string, Set<string>>()
      const names = byModule.get(moduleSpecifier) ?? new Set<string>()
      names.add(importName)
      byModule.set(moduleSpecifier, names)
      pendingImports.set(relativePosix, byModule)
    },
    planNamedImport(
      relativePosix: string,
      moduleSpecifier: string,
      importName: string,
      atOffset: number
    ): NamedImportPlan {
      if (!moduleSpecifier || !importName) {
        return { kind: 'blocked', reason: `no import source is configured for \`${importName}\`` }
      }
      const targetPath = resolveWithinRoot(absoluteRoot, relativePosix)
      let text: string
      try {
        text = readFileSync(targetPath, 'utf-8')
      } catch (error) {
        return {
          kind: 'blocked',
          reason: `cannot read ${relativePosix}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        }
      }
      return planNamedImportInSource(targetPath, text, moduleSpecifier, importName, atOffset)
    },
    flushPendingImports(): number {
      let changedFiles = 0
      for (const [relativePosix, byModule] of pendingImports) {
        const targetPath = resolveWithinRoot(absoluteRoot, relativePosix)
        let text: string
        try {
          text = readFileSync(targetPath, 'utf-8')
        } catch (error) {
          log.warn(
            `arch-guard: cannot add imports to ${relativePosix}: ${
              error instanceof Error ? error.message : String(error)
            }`
          )
          continue
        }
        let changed = false
        for (const [moduleSpecifier, names] of byModule) {
          for (const name of [...names].sort((a, b) => a.localeCompare(b))) {
            const result = ensureNamedImportInSource(targetPath, text, moduleSpecifier, name)
            if (result.blocked !== undefined) {
              // 到这一步才发现补不上，说明改写已经落盘了——必须喊出来，不能留一份静默的坏代码。
              log.warn(
                `arch-guard: ${relativePosix} now uses \`${name}\` but no import was added — ${result.blocked}. ` +
                  'Review this file: it may not compile.'
              )
              continue
            }
            if (result.changed) {
              text = result.text
              changed = true
              log.info(`arch-guard: imported ${name} from ${moduleSpecifier} in ${relativePosix}`)
            }
          }
        }
        if (changed) {
          writeFileAtomically(targetPath, text)
          changedFiles += 1
        }
      }
      pendingImports.clear()
      return changedFiles
    },
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
export type {
  FixContext,
  InternalFixContext,
  NamedImportPlan,
  TextReplacementOptions,
  TextReplacementRange,
}
