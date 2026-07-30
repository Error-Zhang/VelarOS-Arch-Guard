import { extname } from 'node:path'

import type { CheckRunContext } from '../../core/defineCheck'
import ts from 'typescript'

/**
 * code-style 规则集共享基础设施。
 *
 * 这里收纳所有 code-style 子规则都会用到的：
 *  - 标准文件过滤集合（生成物 / 测试 / 夹具 / `.d.ts` 一律不扫）
 *  - 扫描面分档（runtime 源码根、前端根、便携库豁免），**全部来自 check options**
 *  - 共享 AST 缓存（通过 context.cache.memo 复用一次解析）
 *  - 工具函数：relative path、行号、字面量识别等
 *
 * **与宿主仓库解耦**：本模块不认识任何具体仓库的目录名。消费方通过 check options
 * （见 {@link readCodeStyleScope}）注入自己的 `runtimeRoots` / `frontendRoots` 等；
 * 一律不传时退化为「配置 `files.roots` 内的全部 TS/TSX」。
 */

/** 任何项目都不该被 code-style 扫描的文件（生成物 / 测试 / 夹具 / 类型声明）。 */
const DefaultSkipPatterns: readonly RegExp[] = [
  /\.d\.ts$/,
  /\.generated\./,
  /\/generated\//,
  /\/fixtures?\//,
  /\/mocks?\//,
  /\/test\//,
  /\/tests\//,
  /\/__tests__\//,
]

/**
 * 从 check options 解析出的扫描面。
 *
 * 缺席即「不过滤」：只声明自己关心的那一档，其余交给 arch-guard 配置的 `files` 作用域。
 */
interface CodeStyleScope {
  /** 收集起点（相对 rootDir）。默认 `['.']`，与配置 `files.roots` 取交集。 */
  scanRoots: readonly string[]
  /** 被视为「运行时业务代码」的根；空数组表示不按根过滤。 */
  runtimeRoots: readonly string[]
  /** 前端 / 渲染层根；空数组表示不按根过滤。 */
  frontendRoots: readonly string[]
  /** 整体豁免的便携库前缀（如工具包自身）。 */
  portableLibraryPrefixes: readonly string[]
  /** 追加跳过 pattern（正则源串）。 */
  extraSkipPatterns: readonly RegExp[]
  /** 单条规则的文件级豁免（精确相对路径）。 */
  allowFiles: ReadonlySet<string>
}

interface CollectCodeStyleFilesOptions {
  /** 默认会跳过 test/generated 等。设 true 则不再跳过这些（用于中文注释扫描全部 .ts）。 */
  includeAuxiliary?: boolean
  /** 默认会跳过便携库前缀。设 false 则不豁免。 */
  excludePortableLibraries?: boolean
  /** 限定到 `runtimeRoots` 内（默认 true；该项为空时等价于不过滤）。 */
  runtimeOnly?: boolean
  /** 限定到 `frontendRoots`（默认 false；该项为空时等价于不过滤）。 */
  frontendOnly?: boolean
  /** 额外的跳过 pattern。 */
  extraSkipPatterns?: readonly RegExp[]
}

interface SourceFileInfo {
  absolutePath: string
  relativePath: string
  sourceFile: ts.SourceFile
}

/** 把 check options 读成扫描面；缺项一律退化为「不过滤」。 */
function readCodeStyleScope(context: CheckRunContext): CodeStyleScope {
  return {
    scanRoots: readStringArray(context, 'scanRoots', ['.']),
    runtimeRoots: readStringArray(context, 'runtimeRoots', []),
    frontendRoots: readStringArray(context, 'frontendRoots', []),
    portableLibraryPrefixes: readStringArray(context, 'portableLibraryPrefixes', []),
    extraSkipPatterns: readStringArray(context, 'skipPatterns', []).map(
      (source) => new RegExp(source)
    ),
    allowFiles: new Set(readStringArray(context, 'allowFiles', [])),
  }
}

/**
 * 收集 code-style 检查关心的 TS/TSX 文件清单。
 *
 * 走 context.files.collect（命中 shared cache），再按 options 声明的根过滤。
 * 返回的相对路径都是 normalized posix 风格，方便和正则对账。
 */
function collectCodeStyleFiles(
  context: CheckRunContext,
  options: CollectCodeStyleFilesOptions = {}
): Array<{ absolutePath: string; relativePath: string }> {
  const scope = readCodeStyleScope(context)
  const extensions = new Set(['.ts', '.tsx'])
  const collected = context.files.collect(scope.scanRoots, extensions)
  const skip = options.includeAuxiliary
    ? [...scope.extraSkipPatterns, ...(options.extraSkipPatterns ?? [])]
    : [...DefaultSkipPatterns, ...scope.extraSkipPatterns, ...(options.extraSkipPatterns ?? [])]

  const runtimeOnly = options.runtimeOnly ?? true
  const excludePortable = options.excludePortableLibraries ?? true

  const result: Array<{ absolutePath: string; relativePath: string }> = []
  for (const absolutePath of collected) {
    const relativePath = toRelative(context, absolutePath)
    if (scope.allowFiles.has(relativePath)) continue
    if (skip.some((pattern) => pattern.test(relativePath))) continue
    if (excludePortable && startsWithAny(relativePath, scope.portableLibraryPrefixes)) continue
    if (options.frontendOnly && !matchesRootScope(relativePath, scope.frontendRoots)) continue
    if (runtimeOnly && !matchesRootScope(relativePath, scope.runtimeRoots)) continue
    result.push({ absolutePath, relativePath })
  }
  return result
}

/** 收集「扫描注释语言」用的源文件——比 runtime 宽，不按运行时根收窄。 */
function collectChineseTextFiles(
  context: CheckRunContext
): Array<{ absolutePath: string; relativePath: string }> {
  return collectCodeStyleFiles(context, { runtimeOnly: false })
}

/** 解析或复用 AST（按 absolute path 跨 check 缓存）。 */
function getCachedSourceFile(
  context: CheckRunContext,
  info: { absolutePath: string }
): ts.SourceFile {
  return context.cache.memo(`ts-source:${info.absolutePath}`, () => {
    const text = context.cache.readSource(info.absolutePath)
    return ts.createSourceFile(
      info.absolutePath,
      text,
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true,
      scriptKindFor(info.absolutePath)
    )
  })
}

/** 把绝对路径转 root-relative 的 posix 字符串。 */
function toRelative(context: CheckRunContext, absolutePath: string): string {
  const root = context.rootDir.replaceAll('\\', '/')
  const normalized = absolutePath.replaceAll('\\', '/')
  if (normalized.startsWith(`${root}/`)) return normalized.slice(root.length + 1)
  if (normalized === root) return ''
  return normalized
}

/** 该文件是否落在 options 声明的前端根内（未声明前端根时恒为 true）。 */
function isFrontendFile(context: CheckRunContext, relativePath: string): boolean {
  return matchesRootScope(relativePath, readCodeStyleScope(context).frontendRoots)
}

/** 取节点首行（1-based）。 */
function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
}

/** 节点首列（1-based）。 */
function columnOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).character + 1
}

/** 取节点源文本（截断到 max 字符，便于错误信息）。 */
function snippetOf(sourceFile: ts.SourceFile, node: ts.Node, max = 80): string {
  const text = node.getText(sourceFile).replaceAll(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function unwrapParensExpression(expr: ts.Expression): ts.Expression {
  let e = expr
  while (ts.isParenthesizedExpression(e)) {
    e = e.expression
  }
  return e
}

/** 自条件子式向上：找到以该子式（去括号后）为 **整段 condition** 的三元。 */
function enclosingConditionalIfDirectCondition(expr: ts.Node): ts.ConditionalExpression | undefined {
  let cur: ts.Node | undefined = expr
  while (cur) {
    const p: ts.Node | undefined = cur.parent
    if (!p) return undefined
    if (
      ts.isConditionalExpression(p) &&
      unwrapParensExpression(p.condition) === unwrapParensExpression(cur as ts.Expression)
    ) return p
    if (ts.isParenthesizedExpression(p) && p.expression === cur) {
      cur = p
      continue
    }
    return undefined
  }
  return undefined
}

/** 遍历整棵 AST，对每个节点回调 visitor。 */
function walk(node: ts.Node, visitor: (n: ts.Node) => void): void {
  visitor(node)
  ts.forEachChild(node, (child) => walk(child, visitor))
}

/** 空根清单 = 不过滤；否则按前缀匹配。 */
function matchesRootScope(relativePath: string, roots: readonly string[]): boolean {
  if (roots.length === 0) return true
  return startsWithAny(relativePath, roots)
}

function startsWithAny(relativePath: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => relativePath.startsWith(prefix))
}

function readStringArray(
  context: CheckRunContext,
  key: string,
  fallback: readonly string[]
): readonly string[] {
  const value = context.options[key]
  if (!Array.isArray(value)) return fallback
  const entries = value.filter((entry): entry is string => typeof entry === 'string')
  return entries.length > 0 ? entries : fallback
}

function scriptKindFor(filePath: string): ts.ScriptKind {
  const ext = extname(filePath).toLowerCase()
  if (ext === '.tsx') return ts.ScriptKind.TSX
  if (ext === '.jsx') return ts.ScriptKind.JSX
  if (ext === '.js' || ext === '.mjs') return ts.ScriptKind.JS
  return ts.ScriptKind.TS
}

export {
  collectChineseTextFiles,
  collectCodeStyleFiles,
  columnOf,
  DefaultSkipPatterns,
  enclosingConditionalIfDirectCondition,
  getCachedSourceFile,
  isFrontendFile,
  lineOf,
  readCodeStyleScope,
  snippetOf,
  toRelative,
  unwrapParensExpression,
  walk,
}
export type { CodeStyleScope, CollectCodeStyleFilesOptions, SourceFileInfo }
