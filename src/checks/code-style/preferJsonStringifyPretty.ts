import { defineCheck } from '../../core/defineCheck'
import type { FixContext } from '../../core/fixContext'
import ts from 'typescript'

import { collectCodeStyleFiles, getCachedSourceFile, lineOf, snippetOf, walk } from './_shared'
import { CodeStyleFixPhase } from './fixPhases'

const preferJsonStringifyPretty = defineCheck({
  id: 'code-style/prefer-json-stringify-pretty',
  title: 'Prefer stringifyPretty for formatted JSON',
  description:
    '将 `JSON.stringify(value, null, 2)` 统一为 `stringifyPretty(value)`（`@velaros-ai/core` 具名导出）。',
  verifies: [
    '识别无 replacer 的两空格 JSON 格式化。',
    '自动替换为 `stringifyPretty(value)`。',
    '保留自定义 replacer / space 的 JSON.stringify 调用。',
  ],
  tags: ['code-style', 'json'],
  defaultSeverity: 'error',
  run({ context, report }) {
    const section = report.section('Prefer JSON.stringifyPretty')
    for (const info of collectCodeStyleFiles(context)) {
      const sourceFile = getCachedSourceFile(context, info)
      walk(sourceFile, (node) => {
        if (!ts.isCallExpression(node)) return
        const valueArgument = readPrettyStringifyValueArgument(sourceFile, node)
        if (!valueArgument) return

        const line = lineOf(sourceFile, node)
        const replacement = `stringifyPretty(${valueArgument})`
        section.add({
          ruleId: 'prefer-json-stringify-pretty',
          file: info.relativePath,
          line,
          message: `${info.relativePath}:${line}: "${snippetOf(sourceFile, node)}" — use ${replacement}.`,
          fingerprintInput: `${info.relativePath}::${line}::prefer-json-stringify-pretty`,
          fixPhase: CodeStyleFixPhase.preferJsonStringifyPretty,
          fixStartOffset: node.getStart(sourceFile),
          applyFix: fixReplaceText(info.relativePath, sourceFile, node, replacement),
        })
      })
    }
  },
})

function readPrettyStringifyValueArgument(
  sourceFile: ts.SourceFile,
  node: ts.CallExpression
): string | undefined {
  const callee = unwrapParens(node.expression)
  if (
    !ts.isPropertyAccessExpression(callee) ||
    callee.name.text !== 'stringify' ||
    callee.expression.getText(sourceFile) !== 'JSON'
  ) return undefined

  if (node.arguments.length !== 3) return undefined
  const [value, replacer, space] = node.arguments
  if (!value || !replacer || !space) return undefined
  if (!isNullishReplacer(replacer)) return undefined
  if (!isTwoSpaceArgument(space)) return undefined
  return value.getText(sourceFile)
}

function isNullishReplacer(expression: ts.Expression): boolean {
  const unwrapped = unwrapParens(expression)
  return (
    unwrapped.kind === ts.SyntaxKind.NullKeyword ||
    (ts.isIdentifier(unwrapped) && unwrapped.text === 'undefined')
  )
}

function isTwoSpaceArgument(expression: ts.Expression): boolean {
  const unwrapped = unwrapParens(expression)
  return ts.isNumericLiteral(unwrapped) && unwrapped.text === '2'
}

function unwrapParens<T extends ts.Expression>(expression: T): ts.Expression {
  let current: ts.Expression = expression
  while (ts.isParenthesizedExpression(current)) {
    current = current.expression
  }
  return current
}

function fixReplaceText(
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

export { preferJsonStringifyPretty }
