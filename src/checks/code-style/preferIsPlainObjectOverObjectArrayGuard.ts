import { defineCheck } from '../../core/defineCheck'
import type { FixContext } from '../../core/fixContext'
import ts from 'typescript'

import { collectCodeStyleFiles, getCachedSourceFile, lineOf, snippetOf, walk } from './_shared'
import { CodeStyleFixPhase } from './fixPhases'
import {
  flattenAndOperands,
  flattenOrChainOperands,
  matchPlainObjectPositiveRawTriple,
  matchRejectPlainObjectOrDeMorganPair,
  matchRejectPlainObjectOrTriple,
  topOfAndChain,
  topOfOrChain,
} from './plainObjectRawAndTriple'

/**
 * - 顶层 **`&&`**：扁平常的 **`typeof x === 'object' && x !== null && !Array.isArray(x)`** → **`isPlainObject(x)`**（与
 *   `forbid-raw-runtime-type-guards` 协作：子式不因先被修成 `isObject`/`isArray` 而被拆散）。
 * - `value && isObject(value) && !isArray(value)` → **`isPlainObject(value)`**（`&&` 链）。
 * - **`!value || !isObject(value) || isArray(value)`**，以及同一语义的 **De Morgan 二连**
 *   **`!isObject(value) || isArray(value)`** / **`typeof value !== 'object' || Array.isArray(value)`** 等；
 *   另支持 **falsy / nullish** 槽多种写法：`!x`，`x == null` / `=== null` / `=== undefined`，`typeof x === 'undefined'`（及 `==`），`isNull` / `isUndefined`，`!isPresent`；**非 object** 槽含 `typeof` 的 `!=` / `!==`；均为 **扁平** **`||`** 三连（或二连）且 **顺序任意** → **`!isPlainObject(value)`**。
 *
 * 链上若还有其它子式，只替换识别到的 **连续** 二连/三连窗口，保留两侧原文。
 *
 * 同时纠正逻辑运算符后缺少空格的拼接。
 */
const preferIsPlainObjectOverObjectArrayGuard = defineCheck({
  id: 'code-style/prefer-is-plain-object-over-object-array-guard',
  title: 'Prefer isPlainObject over isObject / !isArray combo',
  description:
    '将 `typeof`/null/array 的 `&&` 三连或 `isObject`+`!isArray` 合并为 `isPlainObject`；将 **拒 plain** 的 `||` **三连**（falsy/nullish、非 object、数组三槽）或 **De Morgan 二连**（`!isObject`+`isArray`、`typeof`+`Array.isArray` 等）合并为 `!isPlainObject`；保留链上其它子式。细则见源码 `plainObjectRawAndTriple.ts` 顶部注释。',
  verifies: [
    '`&&` 链：`isObject`+`!isArray` 与 object/null/array 原始子式；可吸收同参 truthy 守卫。',
    '`||` 链：`matchRejectPlainObjectOrTriple` / `matchRejectPlainObjectOrDeMorganPair` 覆盖的 flat 二连、三连（顺序任意）。',
    '`arch-guard run --fix`：`&&` / `||` 分别用对应运算符拼接。',
  ],
  tags: ['code-style', 'type-guards'],
  defaultSeverity: 'error',
  run({ context, report }) {
    const section = report.section('Prefer isPlainObject')
    for (const info of collectCodeStyleFiles(context)) {
      const sourceFile = getCachedSourceFile(context, info)
      walk(sourceFile, (node) => {
        if (!ts.isBinaryExpression(node)) return

        if (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
          if (topOfAndChain(node) !== node) return

          const parts = flattenAndOperands(node)
          const plan = planPlainObjectReplacement(parts, sourceFile)
          if (!plan) return

          const line = lineOf(sourceFile, node)
          const replacement = [...plan.prefixTexts, plan.plainCall, ...plan.suffixTexts].join(' && ')

          section.add({
            ruleId: 'prefer-is-plain-object',
            file: info.relativePath,
            line,
            message: `${info.relativePath}:${line}: "${snippetOf(sourceFile, node)}" — 请用 \`${plan.plainCall}\` 收敛 isObject/!isArray 组合（可 \`arch-guard run --fix\`）。`,
            fingerprintInput: `${info.relativePath}::${line}::is-plain-object`,
            fixPhase: CodeStyleFixPhase.preferIsPlainObject,
            fixStartOffset: node.getStart(sourceFile),
            applyFix: fixReplaceRange(info.relativePath, sourceFile, node, replacement),
          })
          return
        }

        if (node.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
          if (topOfOrChain(node) !== node) return

          const parts = flattenOrChainOperands(node)
          const orPlan = planRejectPlainObjectReplacement(parts, sourceFile)
          if (!orPlan) return

          const line = lineOf(sourceFile, node)
          const replacement = [...orPlan.prefixTexts, orPlan.negPlainCall, ...orPlan.suffixTexts].join(' || ')

          section.add({
            ruleId: 'prefer-not-plain-object-or',
            file: info.relativePath,
            line,
            message: `${info.relativePath}:${line}: "${snippetOf(sourceFile, node)}" — 请用 \`${orPlan.negPlainCall}\` 收敛 !x/!isObject/isArray 析取（可 \`arch-guard run --fix\`）。`,
            fingerprintInput: `${info.relativePath}::${line}::not-plain-object-or`,
            fixPhase: CodeStyleFixPhase.preferIsPlainObject,
            fixStartOffset: node.getStart(sourceFile),
            applyFix: fixReplaceRange(info.relativePath, sourceFile, node, replacement),
          })
        }
      })
    }
  },
})

function fixReplaceRange(
  relativePath: string,
  sourceFile: ts.SourceFile,
  node: ts.Node,
  replacement: string
): (ctx: FixContext) => void {
  return (ctx) => {
    const text = ctx.readTextFile(relativePath)
    const start = node.getStart(sourceFile)
    const end = node.getEnd()
    ctx.writeTextFile(relativePath, `${text.slice(0, start)}${replacement}${text.slice(end)}`)
  }
}

interface ReplacementPlan {
  prefixTexts: string[]
  suffixTexts: string[]
  plainCall: string
}

function planPlainObjectReplacement(parts: ts.Expression[], sourceFile: ts.SourceFile): ReplacementPlan | undefined {
  for (let start = 0; start <= parts.length - 3; start += 1) {
    const subj = matchPlainObjectPositiveRawTriple(parts.slice(start, start + 3), sourceFile)
    if (!subj) continue
    let left = start - 1
    while (left >= 0) {
      const guard = parts[left]
      if (!guard || !isRedundantTruthyGuardOn(guard, subj, sourceFile)) break
      left -= 1
    }
    const inner = formatPlainObjectOperand(subj, sourceFile)
    const plainCall = `isPlainObject(${inner})`
    return {
      prefixTexts: parts.slice(0, left + 1).map((p) => p.getText(sourceFile)),
      suffixTexts: parts.slice(start + 3).map((p) => p.getText(sourceFile)),
      plainCall,
    }
  }

  const n = parts.length
  for (let i = 0; i < n - 1; i += 1) {
    const part = parts[i]
    const nextPart = parts[i + 1]
    if (!part || !nextPart) continue
    const objCall = readGlobalUnaryCall(part, 'isObject', sourceFile)
    const arrArg = readNegatedGlobalCallArg(nextPart, 'isArray', sourceFile)
    if (!objCall || !arrArg || !expressionsTextEqual(objCall.arg, arrArg, sourceFile)) continue

    const inner = formatPlainObjectOperand(objCall.arg, sourceFile)
    const plainCall = `isPlainObject(${inner})`

    let start = i - 1
    while (start >= 0) {
      const guard = parts[start]
      if (!guard || !isRedundantTruthyGuardOn(guard, objCall.arg, sourceFile)) break
      start -= 1
    }
    const prefixTexts = parts.slice(0, start + 1).map((p) => p.getText(sourceFile))
    const suffixTexts = parts.slice(i + 2).map((p) => p.getText(sourceFile))
    return { prefixTexts, suffixTexts, plainCall }
  }
  return undefined
}

interface RejectPlainObjectOrPlan {
  prefixTexts: string[]
  suffixTexts: string[]
  negPlainCall: string
}

function planRejectPlainObjectReplacement(
  parts: ts.Expression[],
  sourceFile: ts.SourceFile
): RejectPlainObjectOrPlan | undefined {
  for (let start = 0; start <= parts.length - 3; start += 1) {
    const slice = parts.slice(start, start + 3)
    const subj = matchRejectPlainObjectOrTriple(slice, sourceFile)
    if (!subj) continue
    const inner = formatPlainObjectOperand(subj, sourceFile)
    const negPlainCall = `!isPlainObject(${inner})`
    return {
      prefixTexts: parts.slice(0, start).map((p) => p.getText(sourceFile)),
      suffixTexts: parts.slice(start + 3).map((p) => p.getText(sourceFile)),
      negPlainCall,
    }
  }
  for (let start = 0; start <= parts.length - 2; start += 1) {
    const slice = parts.slice(start, start + 2)
    const subj = matchRejectPlainObjectOrDeMorganPair(slice, sourceFile)
    if (!subj) continue
    const inner = formatPlainObjectOperand(subj, sourceFile)
    const negPlainCall = `!isPlainObject(${inner})`
    return {
      prefixTexts: parts.slice(0, start).map((p) => p.getText(sourceFile)),
      suffixTexts: parts.slice(start + 2).map((p) => p.getText(sourceFile)),
      negPlainCall,
    }
  }
  return undefined
}

function unwrapParens(expr: ts.Expression): ts.Expression {
  let e = expr
  while (ts.isParenthesizedExpression(e)) {
    e = e.expression
  }
  return e
}

function readGlobalUnaryCall(
  expr: ts.Expression,
  name: 'isObject',
  _sourceFile: ts.SourceFile
): { arg: ts.Expression } | undefined {
  const u = unwrapParens(expr)
  if (!ts.isCallExpression(u) || u.arguments.length !== 1) return undefined
  if (!ts.isIdentifier(u.expression) || u.expression.text !== name) return undefined
  const arg = u.arguments[0]
  if (!arg) return undefined
  return { arg }
}

function readNegatedGlobalCallArg(
  expr: ts.Expression,
  name: 'isArray',
  _sourceFile: ts.SourceFile
): ts.Expression | undefined {
  const u = unwrapParens(expr)
  if (!ts.isPrefixUnaryExpression(u) || u.operator !== ts.SyntaxKind.ExclamationToken) return undefined
  const inner = unwrapParens(u.operand)
  if (!ts.isCallExpression(inner) || inner.arguments.length !== 1) return undefined
  if (!ts.isIdentifier(inner.expression) || inner.expression.text !== name) return undefined
  const arg = inner.arguments[0]
  if (!arg) return undefined
  return arg
}

function expressionsTextEqual(a: ts.Expression, b: ts.Expression, sourceFile: ts.SourceFile): boolean {
  return a.getText(sourceFile) === b.getText(sourceFile)
}

function isRedundantTruthyGuardOn(guard: ts.Expression, subject: ts.Expression, sourceFile: ts.SourceFile): boolean {
  const u = unwrapParens(guard)
  if (expressionsTextEqual(u, subject, sourceFile)) return true
  if (!ts.isPrefixUnaryExpression(u) || u.operator !== ts.SyntaxKind.ExclamationToken) return false
  const inner = unwrapParens(u.operand)
  if (!ts.isPrefixUnaryExpression(inner) || inner.operator !== ts.SyntaxKind.ExclamationToken) return false
  return expressionsTextEqual(unwrapParens(inner.operand), subject, sourceFile)
}

function formatPlainObjectOperand(expression: ts.Expression, sourceFile: ts.SourceFile): string {
  const text = expression.getText(sourceFile)
  if (
    ts.isIdentifier(expression) ||
    expression.kind === ts.SyntaxKind.ThisKeyword ||
    expression.kind === ts.SyntaxKind.SuperKeyword ||
    ts.isNonNullExpression(expression) ||
    ts.isPropertyAccessExpression(expression) ||
    ts.isElementAccessExpression(expression) ||
    ts.isMetaProperty(expression)
  ) return text
  return `(${text})`
}

export { preferIsPlainObjectOverObjectArrayGuard }
