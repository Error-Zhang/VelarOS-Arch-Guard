import { defineCheck } from '../../core/defineCheck'
import ts from 'typescript'

import { collectCodeStyleFiles, getCachedSourceFile, lineOf, walk } from './_shared'

const FailureCallNamePatterns = [
  /^set[A-Za-z0-9_]*Error$/,
  /^show[A-Za-z0-9_]*Error$/,
  /^handle[A-Za-z0-9_]*(?:Error|Failure)(?:[A-Z][A-Za-z0-9_]*)?$/,
  /^record[A-Za-z0-9_]*Failure$/,
]
const FailureCallExactNames = new Set(['caught', 'reject', 'rejectOnce', 'markFailure'])
const ErrorReportingTextPatterns = [
  /\b(?:Log|logRuntime)\.(?:tag\([^)]*\)\.)?(?:caught|error|warn|info|debug)\b/,
  /\b(?:log|logger|this\.log|this\.logger)(?:\?\.|\.)+(?:caught|error|warn|info|debug)\b/,
  /\b(?:message|messageLatest|globalMessageLatest|noticeLatest|toast|notification)(?:\.current)?(?:\?\.|\.)(?:error|warning|warn|open)\b/,
  /\bon[A-Za-z0-9_]*Error[A-Za-z0-9_]*\.current\b/,
  /\b(?:Result|ResultFactory)\.(?:err|fail|failure)\b/,
]
const ErrorPayloadNamePattern = /error|failure|skippedReason|diagnostics/i

// 内联豁免标记：紧邻 `catch` 上一行或同一行的注释命中以下任一文本即视为显式豁免。
// 用法：必须在豁免注释里写明原因（开发者强制让自己解释 why-silent）。
// 单源导出：吞异常门（forbidSwallowedErrors）复用同一套标记，保证「有注解即合法」跨检查一致。
const SilentCatchSuppressionMarkers = [
  'arch-guard-ignore require-error-logging',
  'arch-guard:silent-catch-ok',
] as const

/**
 * `catch (err) { ... }` 不允许"静默吞错"：必须以下其一
 *   - re-throw
 *   - 调用 Log/messageLatest/onXxxError.current 等已知的 reporting 渠道
 *   - 返回/赋值一个 ErrorResult 形态对象 (`{ ok: false, ... }` / `{ error: ... }` / `{ kind: 'error', ... }`)
 *   - 把 catch 参数（error/err/e/...）直接作为返回值/结构字段透传到上层
 *   - 加内联豁免注释（详见 SilentCatchSuppressionMarkers）——用于"本身就是 fallback 路径"
 *
 * 启发式：以名字模式 + 已知 reporting helper 识别"算是处理了"。
 * 若启发式还不够，可在团队规范里把"通过 Result.fail/ResultFactory.fail"也加进 ErrorReportingTextPatterns。
 */
const requireErrorLogging = defineCheck({
  id: 'code-style/require-error-logging',
  title: 'Require explicit handling in catch blocks',
  description: 'catch (err) {...} 不得静默吞错；必须 rethrow、log、message 提示或返回 ErrorResult。',
  verifies: [
    '识别 catch clause，遍历其 body 检查是否包含 throw / known reporting call / ErrorResult-shaped 返回。',
    'catch 参数被透传到 return shape 视为已处理（错误形态被上抛）。',
    '紧邻 catch 的内联豁免注释（如 `// arch-guard:silent-catch-ok <reason>`）视为显式豁免。',
    '若都没有，则报告 "Unhandled catch blocks"。',
  ],
  tags: ['code-style', 'error-handling'],
  defaultSeverity: 'error',
  run({ context, report }) {
    const section = report.section('Unhandled catch blocks')
    for (const info of collectCodeStyleFiles(context)) {
      const sourceFile = getCachedSourceFile(context, info)
      walk(sourceFile, (node) => {
        if (!ts.isCatchClause(node)) return
        if (hasInlineSuppression(sourceFile, node)) return
        const catchParamName = readCatchParameterName(node)
        if (isCatchHandled(sourceFile, node.block, catchParamName)) return
        const line = lineOf(sourceFile, node)
        section.add({
          ruleId: 'silent-catch',
          file: info.relativePath,
          line,
          message: `${info.relativePath}:${line}: catch block handles an error without reporting it. Use Log/messageLatest, rethrow, or return an explicit ErrorResult.`,
          fingerprintInput: `${info.relativePath}::${line}::silent-catch`,
        })
      })
    }
  },
})

function readCatchParameterName(clause: ts.CatchClause): string | undefined {
  if (!clause.variableDeclaration) return undefined
  const name = clause.variableDeclaration.name
  return ts.isIdentifier(name) ? name.text : undefined
}

function hasInlineSuppression(sourceFile: ts.SourceFile, clause: ts.CatchClause): boolean {
  // 把整段 try-catch（含 try body 末尾注释、catch body 内注释）作为豁免标记的搜索范围。
  // 这样以下三种位置的注释都能识别到：
  //   1) try { ...; /* arch-guard:silent-catch-ok */ } catch { ... }
  //   2) try { ... } /* arch-guard:silent-catch-ok */ catch { ... }
  //   3) try { ... } catch { /* arch-guard:silent-catch-ok */ ... }
  const tryStatement = clause.parent
  if (!ts.isTryStatement(tryStatement)) return false
  const text = tryStatement.getText(sourceFile)
  return SilentCatchSuppressionMarkers.some((marker) => text.includes(marker))
}

function isCatchHandled(
  sourceFile: ts.SourceFile,
  block: ts.Block,
  catchParamName: string | undefined
): boolean {
  let handled = false
  const visit = (node: ts.Node): void => {
    if (handled) return
    if (ts.isThrowStatement(node)) {
      handled = true
      return
    }
    if (isErrorResultAssignment(node)) {
      handled = true
      return
    }
    if (ts.isCallExpression(node) && isErrorReportingCall(sourceFile, node)) {
      handled = true
      return
    }
    if (ts.isAwaitExpression(node) && ts.isCallExpression(node.expression) && isErrorReportingCall(sourceFile, node.expression)) {
      handled = true
      return
    }
    if (ts.isReturnStatement(node) && node.expression) {
      if (catchParamName && returnExpressionReferences(node.expression, catchParamName)) {
        handled = true
        return
      }
      if (ts.isObjectLiteralExpression(node.expression) && isErrorResultObject(node.expression)) {
        handled = true
        return
      }
      if (ts.isCallExpression(node.expression) && isErrorReportingCall(sourceFile, node.expression)) {
        handled = true
        return
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(block)
  return handled
}

function returnExpressionReferences(node: ts.Node, name: string): boolean {
  let found = false
  const visit = (n: ts.Node): void => {
    if (found) return
    if (ts.isIdentifier(n) && n.text === name) {
      found = true
      return
    }
    ts.forEachChild(n, visit)
  }
  visit(node)
  return found
}

function isErrorReportingCall(sourceFile: ts.SourceFile, call: ts.CallExpression): boolean {
  const callText = call.expression.getText(sourceFile)
  if (ErrorReportingTextPatterns.some((pattern) => pattern.test(callText))) return true
  const calleeName = readCalleeName(call.expression)
  if (calleeName) {
    if (FailureCallExactNames.has(calleeName)) return true
    if (FailureCallNamePatterns.some((pattern) => pattern.test(calleeName))) return true
  }
  return call.arguments.some(
    (arg) => ts.isObjectLiteralExpression(arg) && isErrorResultObject(arg)
  )
}

function isErrorResultAssignment(node: ts.Node): boolean {
  return (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    ts.isObjectLiteralExpression(node.right) &&
    isErrorResultObject(node.right)
  )
}

function isErrorResultObject(obj: ts.ObjectLiteralExpression): boolean {
  for (const property of obj.properties) {
    if (!ts.isPropertyAssignment(property)) continue
    const name = readPropertyName(property.name)
    if (!name) continue
    if (ErrorPayloadNamePattern.test(name)) return true
    if (name === 'ok' && property.initializer.kind === ts.SyntaxKind.FalseKeyword) return true
    if (
      (name === 'status' || name === 'state') &&
      ts.isStringLiteralLike(property.initializer) &&
      (property.initializer.text === 'failed' || property.initializer.text === 'error')
    ) return true
    if (
      (name === 'kind' || name === 'tone') &&
      ts.isStringLiteralLike(property.initializer) &&
      property.initializer.text === 'error'
    ) return true
    if (ts.isObjectLiteralExpression(property.initializer) && isErrorResultObject(property.initializer)) return true
  }
  return false
}

function readPropertyName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text
  return undefined
}

function readCalleeName(expression: ts.Expression): string | undefined {
  if (ts.isIdentifier(expression)) return expression.text
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text
  if (
    ts.isElementAccessExpression(expression) &&
    ts.isStringLiteralLike(expression.argumentExpression)
  ) return expression.argumentExpression.text
  return undefined
}

export { requireErrorLogging, SilentCatchSuppressionMarkers }
