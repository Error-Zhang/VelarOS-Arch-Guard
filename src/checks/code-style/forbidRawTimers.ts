import { defineCheck } from '../../core/defineCheck'
import ts from 'typescript'

import { collectCodeStyleFiles, getCachedSourceFile, lineOf, snippetOf, walk } from './_shared'

const TimerNames = new Set([
  'cancelAnimationFrame',
  'clearInterval',
  'clearTimeout',
  'requestAnimationFrame',
  'setInterval',
  'setTimeout',
])
const GlobalOwners = new Set(['globalThis', 'self', 'window'])

/**
 * 运行时代码不得直接调用原生 setTimeout/setInterval/requestAnimationFrame 等；
 * 必须通过 TimerScope / useTimerScope 注册到生命周期作用域，避免卸载后内存泄漏和回调失序。
 *
 * 识别 `setTimeout(...)`、`window.setTimeout(...)`、`globalThis.setInterval(...)` 等形式；
 * 不会误伤 `myObj.setTimeout`（非全局 owner）。
 */
const forbidRawTimers = defineCheck({
  id: 'code-style/forbid-raw-timers',
  title: 'Forbid raw timer APIs',
  description:
    '运行时禁止直调 setTimeout/clearTimeout/setInterval/requestAnimationFrame 等原生计时 API。',
  verifies: [
    '识别裸调 setTimeout(...) 或 window.setTimeout(...) 等并报告。',
    '计时器作用域实现本体由 options `allowFiles` 声明豁免。',
  ],
  tags: ['code-style', 'runtime-safety'],
  defaultSeverity: 'error',
  run({ context, report }) {
    const section = report.section('Direct timer usage')
    for (const info of collectCodeStyleFiles(context)) {
      const sourceFile = getCachedSourceFile(context, info)
      walk(sourceFile, (node) => {
        if (!ts.isCallExpression(node)) return
        const timerName = readTimerCallName(sourceFile, node.expression)
        if (!timerName) return
        const line = lineOf(sourceFile, node)
        section.add({
          ruleId: 'raw-timer-call',
          file: info.relativePath,
          line,
          message: `${info.relativePath}:${line}: "${snippetOf(sourceFile, node)}" calls native ${timerName}. Use TimerScope / useTimerScope so timers are tracked by lifecycle scope.`,
          fingerprintInput: `${info.relativePath}::${line}::${timerName}`,
          suggestion:
            'Replace with TimerScope.after/every/nextFrame/sleep/withTimeout, or useTimerScope in React.',
        })
      })
    }
  },
})

function readTimerCallName(
  sourceFile: ts.SourceFile,
  expression: ts.Expression
): string | undefined {
  if (ts.isIdentifier(expression)) return TimerNames.has(expression.text) ? expression.text : undefined
  if (!ts.isPropertyAccessExpression(expression)) return undefined
  if (!TimerNames.has(expression.name.text)) return undefined
  const ownerText = expression.expression.getText(sourceFile)
  return GlobalOwners.has(ownerText) ? expression.name.text : undefined
}

export { forbidRawTimers }
