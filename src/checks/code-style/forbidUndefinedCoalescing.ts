import { defineCheck } from '../../core/defineCheck'
import ts from 'typescript'

import { collectCodeStyleFiles, getCachedSourceFile, lineOf, snippetOf, unwrapParensExpression, walk } from './_shared'

/**
 * 禁止 `expr ?? undefined` 这类内联缺席归一化（宪章 §12.6「`?? undefined` 全仓禁绝」）。
 *
 * `undefined` 只保留语言原生语义（可选参数/属性未提供、外部 API 交界），不当值传递；
 * 缺席语义直接由 contract 表达（可选属性用 `?:`，值缺席用 `Nullable<T>`）。
 *
 * 与 `forbid-nullish-churn` 并列同族：churn 是软性风格 nudge（warning），本门是 §12.6
 * 硬棘轮（error），对 `?? undefined` 立门——存量入 baseline，新增即红。
 */
const forbidUndefinedCoalescing = defineCheck({
  id: 'code-style/forbid-undefined-coalescing',
  title: 'Forbid `?? undefined` coalescing',
  description:
    '禁止 `expr ?? undefined` 内联缺席归一化（§12.6）；缺席语义由 contract 表达（`?:` 或 `Nullable<T>`）。',
  verifies: [
    '走 AST 识别 `??` 二元表达式且右操作数为 `undefined` / `void 0`。',
  ],
  tags: ['code-style', 'nullish-discipline'],
  defaultSeverity: 'error',
  run({ context, report }) {
    const section = report.section('Undefined coalescing')
    for (const info of collectCodeStyleFiles(context)) {
      const sourceFile = getCachedSourceFile(context, info)
      walk(sourceFile, (node) => {
        if (!ts.isBinaryExpression(node)) return
        if (node.operatorToken.kind !== ts.SyntaxKind.QuestionQuestionToken) return
        if (!isUndefinedExpression(unwrapParensExpression(node.right))) return
        const line = lineOf(sourceFile, node)
        section.add({
          ruleId: 'coalesce-undefined',
          file: info.relativePath,
          line,
          message: `${info.relativePath}:${line}: "${snippetOf(sourceFile, node)}" — \`?? undefined\` 全仓禁绝（§12.6）。省略字段、改可选 \`?:\`，或需要值缺席时用 \`Nullable<T>\` + toNullable。`,
          fingerprintInput: `${info.relativePath}::${line}::coalesce-undefined`,
        })
      })
    }
  },
})

function isUndefinedExpression(node: ts.Node): boolean {
  if (ts.isIdentifier(node) && node.text === 'undefined') return true
  if (ts.isVoidExpression(node)) return true
  return false
}

export { forbidUndefinedCoalescing }
