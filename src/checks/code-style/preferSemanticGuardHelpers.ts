import { defineCheck } from '../../core/defineCheck'
import type { FixContext } from '../../core/fixContext'
import ts from 'typescript'

import { fixReplaceSpan, type HelperImportSources, readHelperImportSources } from './_fix'
import { collectCodeStyleFiles, getCachedSourceFile, lineOf, snippetOf, walk } from './_shared'
import { CodeStyleFixPhase } from './fixPhases'

const preferSemanticGuardHelpers = defineCheck({
  id: 'code-style/prefer-semantic-guard-helpers',
  title: 'Prefer semantic guard helpers',
  description:
    '将常见 guard 样板合并为全局 helper：isNonEmptyArray(value)、isPositiveNumber(value)。',
  verifies: [
    '`isArray(x) && !x.isEmpty` → `isNonEmptyArray(x)`。',
    '`isNumber(x) && x > 0` → `isPositiveNumber(x)`。',
    '`arch-guard run --fix` 就地替换源码。',
  ],
  tags: ['code-style', 'type-guards'],
  defaultSeverity: 'error',
  run({ context, report }) {
    const section = report.section('Prefer semantic guard helpers')
    const helpers = readHelperImportSources(context)
    for (const info of collectCodeStyleFiles(context)) {
      const sourceFile = getCachedSourceFile(context, info)
      walk(sourceFile, (node) => {
        if (
          !ts.isBinaryExpression(node) ||
          node.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken
        ) return

        const replacement =
          readIsNonEmptyArrayReplacement(node, sourceFile) ??
          readIsPositiveNumberReplacement(node, sourceFile)
        if (!replacement) return

        const replaceNode = expandParenthesizedExpression(node)
        const line = lineOf(sourceFile, node)
        section.add({
          ruleId: 'prefer-semantic-guard-helper',
          file: info.relativePath,
          line,
          message: `${info.relativePath}:${line}: "${snippetOf(sourceFile, node)}" — 请写成 \`${replacement}\`（可 \`arch-guard run --fix\`）。`,
          fingerprintInput: `${info.relativePath}::${line}::semantic-guard-helper::${replacement}`,
          fixPhase: CodeStyleFixPhase.preferSemanticGuardHelpers,
          fixStartOffset: replaceNode.getStart(sourceFile),
          applyFix: fixReplaceText(info.relativePath, sourceFile, replaceNode, replacement, helpers),
        })
      })
    }
  },
})

function readIsNonEmptyArrayReplacement(
  node: ts.BinaryExpression,
  sourceFile: ts.SourceFile
): string | undefined {
  const guardArg = readGlobalCallArg(node.left, 'isArray')
  if (!guardArg) return undefined

  const arraySubject = readNonEmptyArraySubject(node.right)
  if (!arraySubject || !sameGuardSubject(guardArg, arraySubject, sourceFile)) return undefined

  return `isNonEmptyArray(${guardArg.getText(sourceFile)})`
}

function readIsPositiveNumberReplacement(
  node: ts.BinaryExpression,
  sourceFile: ts.SourceFile
): string | undefined {
  const guardArg = readGlobalCallArg(node.left, 'isNumber')
  if (!guardArg) return undefined

  const numberSubject = readGreaterThanZeroSubject(node.right)
  if (!numberSubject || !sameGuardSubject(guardArg, numberSubject, sourceFile)) return undefined

  return `isPositiveNumber(${guardArg.getText(sourceFile)})`
}

function readGlobalCallArg(
  expression: ts.Expression,
  functionName: string
): ts.Expression | undefined {
  const call = unwrapParens(expression)
  if (!ts.isCallExpression(call)) return undefined

  const callee = unwrapParens(call.expression)
  if (!ts.isIdentifier(callee) || callee.text !== functionName) return undefined

  return call.arguments.length === 1 ? call.arguments[0] : undefined
}

function readNonEmptyArraySubject(expression: ts.Expression): ts.Expression | undefined {
  const unwrapped = unwrapParens(expression)
  if (
    ts.isPrefixUnaryExpression(unwrapped) &&
    unwrapped.operator === ts.SyntaxKind.ExclamationToken
  ) {
    const operand = unwrapParens(unwrapped.operand)
    if (ts.isPropertyAccessExpression(operand) && operand.name.text === 'isEmpty') return operand.expression
  }

  return undefined
}

function readGreaterThanZeroSubject(expression: ts.Expression): ts.Expression | undefined {
  const unwrapped = unwrapParens(expression)
  if (
    !ts.isBinaryExpression(unwrapped) ||
    unwrapped.operatorToken.kind !== ts.SyntaxKind.GreaterThanToken
  ) return undefined

  const right = unwrapParens(unwrapped.right)
  if (!ts.isNumericLiteral(right) || right.text !== '0') return undefined

  return unwrapped.left
}

function sameGuardSubject(
  guardedExpression: ts.Expression,
  narrowedExpression: ts.Expression,
  sourceFile: ts.SourceFile
): boolean {
  return (
    normalizeOptionalAccessText(guardedExpression.getText(sourceFile)) ===
    normalizeOptionalAccessText(narrowedExpression.getText(sourceFile))
  )
}

function normalizeOptionalAccessText(text: string): string {
  return text.replaceAll('?.', '.')
}

function unwrapParens<T extends ts.Expression>(expression: T): ts.Expression {
  let current: ts.Expression = expression
  while (ts.isParenthesizedExpression(current)) {
    current = current.expression
  }
  return current
}

function expandParenthesizedExpression(expression: ts.Expression): ts.Expression {
  let current: ts.Expression = expression
  while (ts.isParenthesizedExpression(current.parent)) {
    current = current.parent
  }
  return current
}

function fixReplaceText(
  relativePath: string,
  sourceFile: ts.SourceFile,
  node: ts.Node,
  replacement: string,
  helpers: HelperImportSources
): (ctx: FixContext) => void {
  return fixReplaceSpan({
    relativePath,
    start: node.getStart(sourceFile),
    end: node.getEnd(),
    replacement,
    helpers,
  }).applyFix
}

export { preferSemanticGuardHelpers }
