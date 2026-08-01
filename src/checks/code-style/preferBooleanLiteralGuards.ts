import { defineCheck } from '../../core/defineCheck'
import type { FixContext } from '../../core/fixContext'
import ts from 'typescript'

import { fixReplaceSpan, type HelperImportSources, readHelperImportSources } from './_fix'
import { collectCodeStyleFiles, getCachedSourceFile, lineOf, snippetOf, walk } from './_shared'
import { CodeStyleFixPhase } from './fixPhases'

const preferBooleanLiteralGuards = defineCheck({
  id: 'code-style/prefer-boolean-literal-guards',
  title: 'Prefer boolean literal guard helpers',
  description:
    '将 Object.is(x, true/false) 与 readBoolean(...) ===/!== true/false 收敛为 isTrue/isFalse，并去掉 helper 内多余的 readBoolean。',
  verifies: [
    '`Object.is(x, true)` → `isTrue(x)`；`Object.is(x, false)` → `isFalse(x)`。',
    "`readBoolean(record, 'flag') !== true` → `!isTrue(record?.flag)`。",
    "`readBoolean(record, 'flag') === false` → `isFalse(record?.flag)`。",
    "`isFalse(readBoolean(record, 'flag'))` → `isFalse(record?.flag)`。",
    '`arch-guard run --fix` 就地替换源码。',
  ],
  tags: ['code-style', 'type-guards', 'boolean'],
  defaultSeverity: 'error',
  run({ context, report }) {
    const section = report.section('Prefer boolean literal guard helpers')
    const helpers = readHelperImportSources(context)
    for (const info of collectCodeStyleFiles(context)) {
      const sourceFile = getCachedSourceFile(context, info)
      walk(sourceFile, (node) => {
        const replacement = readReplacement(node, sourceFile)
        if (!replacement) return

        const replaceNode = expandParenthesizedExpression(node)
        const line = lineOf(sourceFile, node)
        section.add({
          ruleId: 'prefer-boolean-literal-guard',
          file: info.relativePath,
          line,
          message: `${info.relativePath}:${line}: "${snippetOf(sourceFile, node)}" — 请写成 \`${replacement}\`（可 \`arch-guard run --fix\`）。`,
          fingerprintInput: `${info.relativePath}::${line}::boolean-literal-guard::${replacement}`,
          fixPhase: CodeStyleFixPhase.preferBooleanLiteralGuards,
          fixStartOffset: replaceNode.getStart(sourceFile),
          applyFix: fixReplaceText(info.relativePath, sourceFile, replaceNode, replacement, helpers),
        })
      })
    }
  },
})

function readReplacement(node: ts.Node, sourceFile: ts.SourceFile): string | undefined {
  if (ts.isCallExpression(node)) return (
      readBooleanGuardCallReplacement(node, sourceFile) ??
      readObjectIsBooleanLiteralReplacement(node, sourceFile)
    )
  if (ts.isBinaryExpression(node)) return readReadBooleanComparisonReplacement(node, sourceFile)
  return undefined
}

function readObjectIsBooleanLiteralReplacement(
  call: ts.CallExpression,
  sourceFile: ts.SourceFile
): string | undefined {
  if (!isObjectIsCall(call) || call.arguments.length !== 2) return undefined

  const leftLiteral = readBooleanLiteral(call.arguments[0])
  const rightLiteral = readBooleanLiteral(call.arguments[1])
  if (!leftLiteral && !rightLiteral) return undefined
  if (leftLiteral && rightLiteral) return undefined

  const literal = leftLiteral ?? rightLiteral
  const expression = leftLiteral ? call.arguments[1] : call.arguments[0]
  if (!literal || !expression) return undefined

  return formatBooleanGuard(expression, literal, sourceFile)
}

function readReadBooleanComparisonReplacement(
  node: ts.BinaryExpression,
  sourceFile: ts.SourceFile
): string | undefined {
  const op = node.operatorToken.kind
  if (
    op !== ts.SyntaxKind.EqualsEqualsEqualsToken &&
    op !== ts.SyntaxKind.ExclamationEqualsEqualsToken
  ) return undefined

  const leftLiteral = readBooleanLiteral(node.left)
  const rightLiteral = readBooleanLiteral(node.right)
  if (!leftLiteral && !rightLiteral) return undefined
  if (leftLiteral && rightLiteral) return undefined

  const expression = unwrapParens(leftLiteral ? node.right : node.left)
  if (!ts.isCallExpression(expression) || !isReadBooleanCall(expression)) return undefined

  const literal = leftLiteral ?? rightLiteral
  if (!literal) return undefined

  return formatBooleanGuard(
    expression,
    literal,
    sourceFile,
    op === ts.SyntaxKind.ExclamationEqualsEqualsToken
  )
}

function readBooleanGuardCallReplacement(
  call: ts.CallExpression,
  sourceFile: ts.SourceFile
): string | undefined {
  const callee = unwrapParens(call.expression)
  if (!ts.isIdentifier(callee) || (callee.text !== 'isTrue' && callee.text !== 'isFalse')) return undefined
  if (call.arguments.length !== 1) return undefined

  const argument = call.arguments[0]
  if (!argument || !ts.isCallExpression(unwrapParens(argument))) return undefined

  const subject = readBooleanSubject(unwrapParens(argument) as ts.CallExpression, sourceFile)
  if (!subject) return undefined

  return `${callee.text}(${subject})`
}

function isObjectIsCall(call: ts.CallExpression): boolean {
  const callee = unwrapParens(call.expression)
  return (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === 'Object' &&
    callee.name.text === 'is'
  )
}

function isReadBooleanCall(call: ts.CallExpression): boolean {
  const callee = unwrapParens(call.expression)
  return (
    ts.isIdentifier(callee) &&
    (callee.text === 'readBoolean' || callee.text === 'readBooleanScalar')
  )
}

function readBooleanSubject(
  call: ts.CallExpression,
  sourceFile: ts.SourceFile
): string | undefined {
  if (!isReadBooleanCall(call)) return undefined

  if (call.arguments.length === 1) return call.arguments[0]?.getText(sourceFile)

  if (call.arguments.length !== 2) return undefined

  const record = call.arguments[0]
  const key = call.arguments[1]
  if (!record || !key || !ts.isStringLiteralLike(key)) return undefined

  return formatOptionalPropertyAccess(record, key.text, sourceFile)
}

function readBooleanLiteral(node: ts.Node | undefined): 'true' | 'false' | undefined {
  if (!node) return undefined
  if (node.kind === ts.SyntaxKind.TrueKeyword) return 'true'
  if (node.kind === ts.SyntaxKind.FalseKeyword) return 'false'
  return undefined
}

function formatBooleanGuard(
  expression: ts.Expression,
  literal: 'true' | 'false',
  sourceFile: ts.SourceFile,
  negated = false
): string {
  const helper = literal === 'true' ? 'isTrue' : 'isFalse'
  const subject = ts.isCallExpression(unwrapParens(expression))
    ? (readBooleanSubject(unwrapParens(expression) as ts.CallExpression, sourceFile) ??
      expression.getText(sourceFile))
    : expression.getText(sourceFile)
  const call = `${helper}(${subject})`
  return negated ? `!${call}` : call
}

function formatOptionalPropertyAccess(
  record: ts.Expression,
  key: string,
  sourceFile: ts.SourceFile
): string {
  const receiver = formatOptionalAccessReceiver(record, sourceFile)
  return isIdentifierText(key) ? `${receiver}?.${key}` : `${receiver}?.[${JSON.stringify(key)}]`
}

function formatOptionalAccessReceiver(record: ts.Expression, sourceFile: ts.SourceFile): string {
  const unwrapped = unwrapParens(record)
  const text = unwrapped.getText(sourceFile)
  if (isSimpleOptionalAccessReceiver(unwrapped)) return text
  return `(${text})`
}

function isSimpleOptionalAccessReceiver(expression: ts.Expression): boolean {
  return (
    ts.isIdentifier(expression) ||
    expression.kind === ts.SyntaxKind.ThisKeyword ||
    ts.isPropertyAccessExpression(expression) ||
    ts.isElementAccessExpression(expression) ||
    ts.isCallExpression(expression) ||
    ts.isNonNullExpression(expression)
  )
}

function isIdentifierText(text: string): boolean {
  return /^[A-Za-z_$][\w$]*$/.test(text)
}

function unwrapParens<T extends ts.Expression>(expression: T): ts.Expression {
  let current: ts.Expression = expression
  while (ts.isParenthesizedExpression(current)) {
    current = current.expression
  }
  return current
}

function expandParenthesizedExpression(expression: ts.Node): ts.Node {
  let current: ts.Node = expression
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

export { preferBooleanLiteralGuards }
