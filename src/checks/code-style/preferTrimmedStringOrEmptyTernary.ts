import { defineCheck } from '../../core/defineCheck'
import type { FixContext } from '../../core/fixContext'
import ts from 'typescript'

import { collectCodeStyleFiles, getCachedSourceFile, lineOf, snippetOf, walk } from './_shared'
import { CodeStyleFixPhase } from './fixPhases'
import { matchTrimmedStringOrEmptyTernary } from './nonBlankStringGuardChains'

/**
 * **`isString(x) ? x.trim() : ''`** 或 **`typeof x === 'string' ? x.trim() : ''`** → **`trimmedStringOrEmpty(x)`**。
 */

const preferTrimmedStringOrEmptyTernary = defineCheck({
  id: 'code-style/prefer-trimmed-string-or-empty-ternary',
  title: 'Prefer trimmedStringOrEmpty over string check + trim ternary',
  description:
    '将 isString(x) 或 typeof x === string（含 ==）与 x.trim() 及字面量 \'\' 的三元合并为 trimmedStringOrEmpty(x)（whenTrue 须为零参 .trim()）。',
  verifies: [
    '顶层三元：string 守卫 + trim + : \'\'。',
    'arch-guard run --fix 整段替换。',
  ],
  tags: ['code-style', 'type-guards'],
  defaultSeverity: 'error',
  run({ context, report }) {
    const section = report.section('Prefer trimmedStringOrEmpty ternary')
    for (const info of collectCodeStyleFiles(context)) {
      const sourceFile = getCachedSourceFile(context, info)
      walk(sourceFile, (node) => {
        if (!ts.isConditionalExpression(node)) return

        const subj = matchTrimmedStringOrEmptyTernary(node, sourceFile)
        if (!subj) return

        const line = lineOf(sourceFile, node)
        const call = `trimmedStringOrEmpty(${formatOperand(subj, sourceFile)})`
        section.add({
          ruleId: 'prefer-trimmed-string-or-empty',
          file: info.relativePath,
          line,
          message: `${info.relativePath}:${line}: "${snippetOf(sourceFile, node)}" — 请用 \`${call}\`（可 \`arch-guard run --fix\`）。`,
          fingerprintInput: `${info.relativePath}::${line}::trimmed-string-or-empty`,
          fixPhase: CodeStyleFixPhase.preferTrimmedStringOrEmpty,
          fixStartOffset: node.getStart(sourceFile),
          applyFix: fixReplaceRange(info.relativePath, sourceFile, node, call),
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

function formatOperand(expression: ts.Expression, sourceFile: ts.SourceFile): string {
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

export { preferTrimmedStringOrEmptyTernary }
