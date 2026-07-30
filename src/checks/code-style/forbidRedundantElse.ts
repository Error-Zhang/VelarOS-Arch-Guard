import { defineCheck } from '../../core/defineCheck'
import ts from 'typescript'

import { collectCodeStyleFiles, getCachedSourceFile, lineOf, walk } from './_shared'

/**
 * 当 if 分支已经 return/throw/continue/break 时，else 分支是冗余的——直接平铺出去更清爽：
 *
 *   if (a) {
 *     return foo
 *   } else {                    // ← 冗余
 *     doSomething()
 *   }
 *
 * 改写：
 *
 *   if (a) return foo
 *   doSomething()
 *
 * 这条规则强制使用 early-return 风格，让"主路径"留在最外层缩进。
 */
const forbidRedundantElse = defineCheck({
  id: 'code-style/forbid-redundant-else-after-return',
  title: 'Forbid redundant else after return/throw',
  description: 'if 分支已 return/throw/continue/break 时，去掉 else 改用 early-return。',
  verifies: ['识别 IfStatement，若 then 分支总是退出当前函数/循环，且存在 else 分支，则报告。'],
  tags: ['code-style', 'readability'],
  defaultSeverity: 'warning',
  run({ context, report }) {
    const section = report.section('Redundant else after exit')
    for (const info of collectCodeStyleFiles(context)) {
      const sourceFile = getCachedSourceFile(context, info)
      walk(sourceFile, (node) => {
        if (!ts.isIfStatement(node)) return
        if (!node.elseStatement) return
        if (!isAlwaysExiting(node.thenStatement)) return
        const line = lineOf(sourceFile, node)
        section.add({
          ruleId: 'redundant-else-after-exit',
          file: info.relativePath,
          line,
          message: `${info.relativePath}:${line}: \`else\` is redundant — the \`if\` branch already exits. Flatten the \`else\` body to the outer scope (early-return).`,
          fingerprintInput: `${info.relativePath}::${line}::redundant-else`,
          suggestion: 'Remove the `else` and let the following block live at the parent indent.',
        })
      })
    }
  },
})

function isAlwaysExiting(node: ts.Statement): boolean {
  if (
    ts.isReturnStatement(node) ||
    ts.isThrowStatement(node) ||
    ts.isContinueStatement(node) ||
    ts.isBreakStatement(node)
  ) return true
  if (!ts.isBlock(node)) return false
  const last = node.statements[node.statements.length - 1]
  if (!last) return false
  return isAlwaysExiting(last)
}

export { forbidRedundantElse }
