import { defineCheck } from '../../core/defineCheck'
import ts from 'typescript'

import { collectCodeStyleFiles, getCachedSourceFile, lineOf, walk } from './_shared'

const MaxIfNestingDepth = 4

/**
 * 函数体内连续嵌套 `if (cond) { if (cond2) { if (cond3) { ... } } }` 超过阈值时报告。
 * 这是 anti-pyramid 守门员，鼓励先 guard early-return / 反转条件，让主路径走在最外层。
 *
 * 计数逻辑：从函数入口算起，沿"单 if + 单分支体"路径累计 if 嵌套深度（不计入 else 分支、不计入循环）。
 * 一旦深度超过 MaxIfNestingDepth，提示重构。
 */
const preferEarlyReturn = defineCheck({
  id: 'code-style/prefer-early-return',
  title: 'Prefer early-return over deep if nesting',
  description: '函数体 if 嵌套超过 4 层时报告；重构为 early-return / guard 风格。',
  verifies: [
    '识别 FunctionDeclaration / MethodDeclaration / FunctionExpression / ArrowFunction 的 body。',
    '沿"单 if + then 分支"链统计最大 if 嵌套深度，超过阈值即报告。',
  ],
  tags: ['code-style', 'readability'],
  defaultSeverity: 'warning',
  run({ context, report }) {
    const section = report.section('Deep if nesting')
    for (const info of collectCodeStyleFiles(context)) {
      const sourceFile = getCachedSourceFile(context, info)
      walk(sourceFile, (node) => {
        if (!isFunctionLike(node)) return
        const body = node.body
        if (!body || !ts.isBlock(body)) return
        const depth = maxIfNestingDepth(body)
        if (depth <= MaxIfNestingDepth) return
        const line = lineOf(sourceFile, node)
        const ownerName = describeFunctionOwner(sourceFile, node)
        section.add({
          ruleId: 'deep-if-nesting',
          file: info.relativePath,
          line,
          message: `${info.relativePath}:${line}: ${ownerName} nests \`if\` ${depth} levels deep. Flatten the pyramid: invert guards and early-return.`,
          fingerprintInput: `${info.relativePath}::${line}::deep-if::${ownerName}`,
        })
      })
    }
  },
})

type FunctionLike =
  | ts.FunctionDeclaration
  | ts.MethodDeclaration
  | ts.FunctionExpression
  | ts.ArrowFunction
  | ts.GetAccessorDeclaration
  | ts.SetAccessorDeclaration

function isFunctionLike(node: ts.Node): node is FunctionLike {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  )
}

function maxIfNestingDepth(node: ts.Node): number {
  let max = 0
  const visit = (current: ts.Node, depth: number): void => {
    if (ts.isIfStatement(current)) {
      const inThen = depth + 1
      if (inThen > max) max = inThen
      visit(current.thenStatement, inThen)
      if (current.elseStatement) visit(current.elseStatement, depth) // else 不累加
      return
    }
    if (isFunctionLike(current)) return // 嵌套函数另算
    ts.forEachChild(current, (child) => visit(child, depth))
  }
  visit(node, 0)
  return max
}

function describeFunctionOwner(sourceFile: ts.SourceFile, node: FunctionLike): string {
  if (ts.isFunctionDeclaration(node) && node.name) return `function ${node.name.text}`
  if (ts.isMethodDeclaration(node)) {
    const className =
      ts.isClassDeclaration(node.parent) && node.parent.name ? node.parent.name.text : '<class>'
    const methodName = ts.isIdentifier(node.name) ? node.name.text : node.name.getText(sourceFile)
    return `${className}.${methodName}`
  }
  if (ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
    const kind = ts.isGetAccessorDeclaration(node) ? 'get' : 'set'
    return `${kind} ${node.name.getText(sourceFile)}`
  }
  return '<anonymous>'
}

export { preferEarlyReturn }
