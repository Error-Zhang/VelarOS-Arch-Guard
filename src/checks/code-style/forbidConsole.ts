import { defineCheck } from '../../core/defineCheck'
import ts from 'typescript'

import { collectCodeStyleFiles, getCachedSourceFile, lineOf, walk } from './_shared'

/**
 * 业务源码禁止直接调用 `console.*`，必须走全局 Log（Log.tag(scope).debug/info/warn/error）。
 *
 * AST-based 实现：识别 `console.method()` 调用以及 `console['method']` 动态访问；
 * 不会误伤 `someObj.console.foo`、JSDoc 中的 console 文本、字符串等。
 *
 * 豁免：日志实现本体等文件由 options `allowFiles` 逐条声明；生成物 / 测试 / 便携库整体豁免见 `_shared`。
 */
const forbidConsole = defineCheck({
  id: 'code-style/forbid-console',
  title: 'Forbid console.*',
  description: '业务源码禁止直接调用 console.*；统一走 Log.tag(scope).*。',
  verifies: [
    '识别 console.<method>() 和 console["method"]() 调用并报告。',
    'options `allowFiles` 声明的文件（日志管线实现本体等）不报。',
  ],
  tags: ['code-style', 'logging'],
  defaultSeverity: 'error',
  run({ context, report }) {
    const section = report.section('Direct console usage')
    for (const info of collectCodeStyleFiles(context, { runtimeOnly: false })) {
      const sourceFile = getCachedSourceFile(context, info)
      walk(sourceFile, (node) => {
        const access = readConsoleAccess(sourceFile, node)
        if (!access) return
        const line = lineOf(sourceFile, node)
        section.add({
          ruleId: 'console-call',
          file: info.relativePath,
          line,
          message: `${info.relativePath}:${line}: "${access}" writes outside the Log pipeline. Use Log.tag(scope).debug/info/warn/error or a domain logger.`,
          fingerprintInput: `${info.relativePath}::${line}::${access}`,
          suggestion: 'Replace with Log.tag("your-scope").info(...) or the appropriate domain logger.',
        })
      })
    }
  },
})

function readConsoleAccess(sourceFile: ts.SourceFile, node: ts.Node): string | undefined {
  if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'console') return `console.${node.name.text}`
  if (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'console') return `console[${node.argumentExpression.getText(sourceFile)}]`
  return undefined
}

export { forbidConsole }
