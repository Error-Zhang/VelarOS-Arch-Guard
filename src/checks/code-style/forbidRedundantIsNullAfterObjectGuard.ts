import { defineCheck } from '../../core/defineCheck'
import type { FixContext } from '../../core/fixContext'
import ts from 'typescript'

import { collectCodeStyleFiles, getCachedSourceFile, lineOf, snippetOf, walk } from './_shared'
import { CodeStyleFixPhase } from './fixPhases'

/**
 * `!isObject(x) && !isNull(x)` 在 **`||` 链中且左侧已有可排除 null 的子式** 时，`!isNull(x)` 恒为 true。
 *
 * 典型来源：`typeof x !== 'object'` 自动修复为 `!isObject(x) && !isNull(x)` 后，又与 `!x` / `x == null` /
 * `isNull(x)` 等并写，产生冗余。
 *
 * 允许的左侧子式（在其为**假**时，可确定 `x` 已非 null）：
 * - `!x`（truthy 分支）
 * - `x == null` / `x === null`（含对侧为 `null` 的写法）
 * - `isNull(x)`（返回 false 时）
 */
const forbidRedundantIsNullAfterObjectGuard = defineCheck({
  id: 'code-style/forbid-redundant-is-null-after-object-guard',
  title: 'Redundant !isNull next to !isObject in OR chains',
  description:
    '在 `||` 链中，若先前子式已保证 `x` 非 null，则 `!isObject(x) && !isNull(x)` 可化为 `!isObject(x)`。',
  verifies: [
    '扁平化顶层 `||` 链，检查 `!isObject(x) && !isNull(x)`（及 `!isNull` 在前的对称写法）。',
    '左侧已有 `!x`、`x == null`、`x === null`、`isNull(x)` 时标冗余并可自动删除 `&& !isNull(x)`。',
  ],
  tags: ['code-style', 'type-guards'],
  defaultSeverity: 'error',
  run({ context, report }) {
    const section = report.section('Redundant isNull with isObject after stronger guard')
    for (const info of collectCodeStyleFiles(context)) {
      const sourceFile = getCachedSourceFile(context, info)

      walk(sourceFile, (node) => {
        if (!ts.isBinaryExpression(node) || node.operatorToken.kind !== ts.SyntaxKind.BarBarToken) return
        if (!isTopOfOrChain(node)) return

        const parts = flattenOrOperands(node)
        for (let i = 1; i < parts.length; i += 1) {
          const part = parts[i]
          if (!part) continue
          const pair = readNotIsObjectAndNotIsNull(part, sourceFile)
          if (!pair) continue
          const target = pair.targetExprText
          const earlier = parts.slice(0, i)
          if (!earlier.some((p) => impliesNotNullWhenPriorOrOperandIsFalsy(p, target, sourceFile))) {
            continue
          }

          const line = lineOf(sourceFile, pair.andExpr)
          const message = `${info.relativePath}:${line}: "${snippetOf(sourceFile, pair.andExpr)}" — 前面已有更强子式排除 \`null\`，\`&& !isNull(${target})\` 冗余；写成 \`!isObject(${target})\` 即可。`
          section.add({
            ruleId: 'redundant-is-null-with-is-object',
            file: info.relativePath,
            line,
            message,
            fingerprintInput: `${info.relativePath}::${line}::${target}`,
            fixPhase: CodeStyleFixPhase.redundantIsNullAfterObjectGuard,
            fixStartOffset: pair.andExpr.getFullStart(),
            applyFix: fixDropIsNullConjunct(info.relativePath, sourceFile, pair.andExpr, pair.isNullOn),
          })
        }
      })
    }
  },
})

function fixDropIsNullConjunct(
  relativePath: string,
  sourceFile: ts.SourceFile,
  andExpr: ts.BinaryExpression,
  isNullOn: 'left' | 'right'
): (ctx: FixContext) => void {
  return (ctx) => {
    const text = ctx.readTextFile(relativePath)
    let dropFrom: number
    let dropTo: number
    if (isNullOn === 'right') {
      dropFrom = andExpr.operatorToken.getStart(sourceFile)
      dropTo = andExpr.right.getEnd()
    } else {
      dropFrom = andExpr.left.getStart(sourceFile)
      dropTo = andExpr.operatorToken.getEnd()
    }
    ctx.writeTextFile(relativePath, `${text.slice(0, dropFrom)}${text.slice(dropTo)}`)
  }
}

function unwrapParens(expr: ts.Expression): ts.Expression {
  let e = expr
  while (ts.isParenthesizedExpression(e)) {
    e = e.expression
  }
  return e
}

function isTopOfOrChain(node: ts.BinaryExpression): boolean {
  if (node.operatorToken.kind !== ts.SyntaxKind.BarBarToken) return false
  let current: ts.Node = node
  while (ts.isBinaryExpression(current.parent) && current.parent.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
    current = current.parent
  }
  return current === node
}

function flattenOrOperands(expr: ts.Expression): ts.Expression[] {
  const u = unwrapParens(expr)
  if (ts.isBinaryExpression(u) && u.operatorToken.kind === ts.SyntaxKind.BarBarToken) return [...flattenOrOperands(u.left), ...flattenOrOperands(u.right)]
  return [u]
}

function impliesNotNullWhenPriorOrOperandIsFalsy(
  part: ts.Expression,
  target: string,
  sourceFile: ts.SourceFile
): boolean {
  const p = unwrapParens(part)

  if (ts.isPrefixUnaryExpression(p) && p.operator === ts.SyntaxKind.ExclamationToken) return p.operand.getText(sourceFile).trim() === target

  if (ts.isBinaryExpression(p)) {
    const op = p.operatorToken.kind
    if (op !== ts.SyntaxKind.EqualsEqualsToken && op !== ts.SyntaxKind.EqualsEqualsEqualsToken) return false
    if (p.right.kind === ts.SyntaxKind.NullKeyword) return p.left.getText(sourceFile).trim() === target
    if (p.left.kind === ts.SyntaxKind.NullKeyword) return p.right.getText(sourceFile).trim() === target
    return false
  }

    if (ts.isCallExpression(p) && p.arguments.length === 1) {
      const arg0 = p.arguments[0]
      if (!arg0) return false
      const callee = p.expression
      if (ts.isIdentifier(callee) && callee.text === 'isNull') return arg0.getText(sourceFile).trim() === target
    }

  return false
}

function readNotIsObjectAndNotIsNull(
  expr: ts.Expression,
  sourceFile: ts.SourceFile
):
  | {
      targetExprText: string
      andExpr: ts.BinaryExpression
      isNullOn: 'left' | 'right'
    }
  | undefined {
  const b = unwrapParens(expr)
  if (!ts.isBinaryExpression(b) || b.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken) return undefined
  const leftN = readNotGlobalCallArg(unwrapParens(b.left), 'isObject', sourceFile)
  const rightN = readNotGlobalCallArg(unwrapParens(b.right), 'isNull', sourceFile)
  if (leftN && rightN && leftN === rightN) return { targetExprText: leftN, andExpr: b, isNullOn: 'right' }
  const leftM = readNotGlobalCallArg(unwrapParens(b.left), 'isNull', sourceFile)
  const rightM = readNotGlobalCallArg(unwrapParens(b.right), 'isObject', sourceFile)
  if (leftM && rightM && leftM === rightM) return { targetExprText: leftM, andExpr: b, isNullOn: 'left' }
  return undefined
}

function readNotGlobalCallArg(
  expr: ts.Expression,
  fn: 'isObject' | 'isNull',
  sourceFile: ts.SourceFile
): string | undefined {
  const u = unwrapParens(expr)
  if (!ts.isPrefixUnaryExpression(u) || u.operator !== ts.SyntaxKind.ExclamationToken) return undefined
  const inner = unwrapParens(u.operand)
  if (!ts.isCallExpression(inner) || inner.arguments.length !== 1) return undefined
  const arg0 = inner.arguments[0]
  if (!arg0) return undefined
  const callee = inner.expression
  if (!ts.isIdentifier(callee) || callee.text !== fn) return undefined
  return arg0.getText(sourceFile).trim()
}

export { forbidRedundantIsNullAfterObjectGuard }
