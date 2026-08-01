import { defineCheck } from '../../core/defineCheck'
import type { FixContext } from '../../core/fixContext'
import ts from 'typescript'

import { fixReplaceSpan, type HelperImportSources, readHelperImportSources } from './_fix'
import { collectCodeStyleFiles, getCachedSourceFile, lineOf, snippetOf, walk } from './_shared'
import { CodeStyleFixPhase } from './fixPhases'

/**
 * 宽松 **`expr != null`** / **`expr == null`**（及 **`undefined`** 的 **`==`/`!=`**）应写成 **`isPresent(expr)`** / **`!isPresent(expr)`**。
 *
 * **豁免**：守卫本体所在文件（`isPresent` 实现就是 **`return value != null`**，不能改为自调用）须由 options `allowFiles` 声明。
 */
const preferIsPresentLooseNullish = defineCheck({
  id: 'code-style/prefer-is-present-loose-nullish',
  title: 'Prefer `isPresent` / `!isPresent` over loose `== null` / `!= null`',
  description:
    '将任意 **`expr != null` / `expr == null`**（及与 **`null` / `undefined` 字面量的宽松比较**）改为 **`isPresent(expr)`** / **`!isPresent(expr)`**。',
  verifies: [
    '识别 `==` / `!=` 且另一侧为 `null` 或 `undefined` 字面量（**不含** `===` / `!==`）。',
    '跳过 **`isPresent(...)`** 已为值的比较（避免 **嵌套**）。',
    '**豁免**：options `allowFiles` 声明的守卫实现文件。',
    '`arch-guard run --fix` 就地替换整段比较表达式。',
  ],
  tags: ['code-style', 'type-guards', 'nullish'],
  defaultSeverity: 'error',
  run({ context, report }) {
    const section = report.section('Prefer isPresent over loose nullish compares')
    const helpers = readHelperImportSources(context)
    for (const info of collectCodeStyleFiles(context)) {
      const sourceFile = getCachedSourceFile(context, info)
      walk(sourceFile, (node) => {
        if (!ts.isBinaryExpression(node)) return
        const matched = matchLooseNullishCompare(sourceFile, node)
        if (!matched) return

        const line = lineOf(sourceFile, node)
        const snippet = snippetOf(sourceFile, node)
        const replacement = matched.negate ? `!isPresent(${matched.valueText})` : `isPresent(${matched.valueText})`
        section.add({
          ruleId: 'loose-nullish-to-is-present',
          file: info.relativePath,
          line,
          message: `${info.relativePath}:${line}: "${snippet}" — 宽松 nullish 比较请改为 **\`${replacement}\`**（可 \`arch-guard run --fix\`）。`,
          fingerprintInput: `${info.relativePath}::${line}::loose-nullish-is-present`,
          fixPhase: CodeStyleFixPhase.preferIsPresentLooseNullish,
          fixStartOffset: node.getStart(sourceFile),
          applyFix: fixReplaceCompare(info.relativePath, sourceFile, node, replacement, helpers),
        })
      })
    }
  },
})

function unwrapParen(expr: ts.Expression): ts.Expression {
  let e = expr
  while (ts.isParenthesizedExpression(e)) {
    e = e.expression
  }
  return e
}

function isNullOrUndefinedLiteral(expr: ts.Expression): boolean {
  const e = unwrapParen(expr)
  return e.kind === ts.SyntaxKind.NullKeyword || e.kind === ts.SyntaxKind.UndefinedKeyword
}

function isAlreadyIsPresentCall(expr: ts.Expression): boolean {
  const e = unwrapParen(expr)
  if (!ts.isCallExpression(e) || e.arguments.length !== 1) return false
  const callee = unwrapParen(e.expression)
  return ts.isIdentifier(callee) && callee.text === 'isPresent'
}

function matchLooseNullishCompare(
  sourceFile: ts.SourceFile,
  node: ts.BinaryExpression
): { valueText: string; negate: boolean } | undefined {
  const op = node.operatorToken.kind
  if (op !== ts.SyntaxKind.ExclamationEqualsToken && op !== ts.SyntaxKind.EqualsEqualsToken) return undefined

  const nullishL = isNullOrUndefinedLiteral(node.left)
  const nullishR = isNullOrUndefinedLiteral(node.right)
  if (nullishL === nullishR) return undefined

  const valueExpr = nullishR ? node.left : node.right
  if (isAlreadyIsPresentCall(valueExpr)) return undefined

  const valueText = valueExpr.getText(sourceFile)
  const negate = op === ts.SyntaxKind.EqualsEqualsToken
  return { valueText, negate }
}

function fixReplaceCompare(
  relativePath: string,
  sourceFile: ts.SourceFile,
  node: ts.BinaryExpression,
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

export { preferIsPresentLooseNullish }
