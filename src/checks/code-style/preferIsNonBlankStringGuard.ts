import { defineCheck } from '../../core/defineCheck'
import type { FixContext } from '../../core/fixContext'
import ts from 'typescript'

import { collectCodeStyleFiles, getCachedSourceFile, lineOf, snippetOf, walk } from './_shared'
import { CodeStyleFixPhase } from './fixPhases'
import { expressionsTextEqual, matchNonBlankStringPositiveAndPair } from './nonBlankStringGuardChains'
import { flattenAndOperands, topOfAndChain } from './plainObjectRawAndTriple'

/**
 * **`isString(x)`** 或 **`typeof x === 'string'`**（含 `==`），与 **`!!x.trim()`** / **`x.trim()`** / **`Boolean(x.trim())`**（顺序任意）→ **`isNonBlankString(x)`**。
 * 可与 **finite-number** 同类：链上其它子式保留；`&&` 上可吸收紧前同参 **truthy** 守卫（`x` / `!!x`）。
 */

const preferIsNonBlankStringGuard = defineCheck({
  id: 'code-style/prefer-is-non-blank-string-guard',
  title: 'Prefer isNonBlankString over guard + trimmed truthiness',
  description:
    '将 isString(x) 或 typeof x === string（含 ==）与 !!x.trim()（或 x.trim() / Boolean(x.trim())，顺序任意）合并为 isNonBlankString(x)；可吸收紧前同参 truthy 守卫。',
  verifies: [
    '扁平 && 二元窗：isString 或 typeof===string（含==）与 trim 真值子式（!!…trim / …trim / Boolean(…trim)）。',
    'arch-guard run --fix 按运算符拼接前缀/后缀子式。',
  ],
  tags: ['code-style', 'type-guards'],
  defaultSeverity: 'error',
  run({ context, report }) {
    const section = report.section('Prefer isNonBlankString')
    for (const info of collectCodeStyleFiles(context)) {
      const sourceFile = getCachedSourceFile(context, info)
      walk(sourceFile, (node) => {
        if (!ts.isBinaryExpression(node)) return
        if (node.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken) return
        if (topOfAndChain(node) !== node) return

        const parts = flattenAndOperands(node)
        const plan = planNonBlankAndReplacement(parts, sourceFile)
        if (!plan) return

        const line = lineOf(sourceFile, node)
        const replacement = [...plan.prefixTexts, plan.nonBlankCall, ...plan.suffixTexts].join(' && ')
        section.add({
          ruleId: 'prefer-is-non-blank-string',
          file: info.relativePath,
          line,
          message: `${info.relativePath}:${line}: "${snippetOf(sourceFile, node)}" — 请用 \`${plan.nonBlankCall}\`（可 \`arch-guard run --fix\`）。`,
          fingerprintInput: `${info.relativePath}::${line}::is-non-blank-string`,
          fixPhase: CodeStyleFixPhase.preferIsNonBlankString,
          fixStartOffset: node.getStart(sourceFile),
          applyFix: fixReplaceRange(info.relativePath, sourceFile, node, replacement),
        })
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

interface NonBlankAndPlan {
  prefixTexts: string[]
  suffixTexts: string[]
  nonBlankCall: string
}

function planNonBlankAndReplacement(parts: ts.Expression[], sourceFile: ts.SourceFile): NonBlankAndPlan | undefined {
  for (let start = 0; start <= parts.length - 2; start += 1) {
    const slice = parts.slice(start, start + 2)
    const subj = matchNonBlankStringPositiveAndPair(slice, sourceFile)
    if (!subj) continue
    let left = start - 1
    while (left >= 0) {
      const guard = parts[left]
      if (!guard || !isRedundantTruthyGuardOn(guard, subj, sourceFile)) break
      left -= 1
    }
    const inner = formatNonBlankOperand(subj, sourceFile)
    const nonBlankCall = `isNonBlankString(${inner})`
    return {
      prefixTexts: parts.slice(0, left + 1).map((p) => p.getText(sourceFile)),
      suffixTexts: parts.slice(start + 2).map((p) => p.getText(sourceFile)),
      nonBlankCall,
    }
  }
  return undefined
}

function isRedundantTruthyGuardOn(guard: ts.Expression, subject: ts.Expression, sourceFile: ts.SourceFile): boolean {
  const u = unwrapParensExpr(guard)
  if (expressionsTextEqual(u, subject, sourceFile)) return true
  if (!ts.isPrefixUnaryExpression(u) || u.operator !== ts.SyntaxKind.ExclamationToken) return false
  const inner = unwrapParensExpr(u.operand)
  if (!ts.isPrefixUnaryExpression(inner) || inner.operator !== ts.SyntaxKind.ExclamationToken) return false
  return expressionsTextEqual(unwrapParensExpr(inner.operand), subject, sourceFile)
}

function unwrapParensExpr(expr: ts.Expression): ts.Expression {
  let e = expr
  while (ts.isParenthesizedExpression(e)) {
    e = e.expression
  }
  return e
}

function formatNonBlankOperand(expression: ts.Expression, sourceFile: ts.SourceFile): string {
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

export { preferIsNonBlankStringGuard }
