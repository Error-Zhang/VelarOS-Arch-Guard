import { defineCheck } from '../../core/defineCheck'
import ts from 'typescript'

import {
  collectCodeStyleFiles,
  getCachedSourceFile,
  lineOf,
  snippetOf,
  unwrapParensExpression,
  walk,
} from './_shared'

const MinimumDependencyCount = 2

/**
 * 提示低价值的 React useMemo：只返回轻量对象/数组字面量，却维护了一长串依赖。
 *
 * 这类包装经常让代码看起来"被优化过"，但实际收益需要下游引用稳定性来证明；
 * 否则依赖列表会变成重复状态声明，改字段时很容易漏。
 */
const preferMeaningfulUseMemo = defineCheck({
  id: 'code-style/prefer-meaningful-use-memo',
  title: 'Prefer meaningful React useMemo',
  description:
    '（建议）useMemo 应用于昂贵计算或明确的引用稳定性边界；仅组装轻量对象/数组且依赖较长时提示改为直接构造。',
  verifies: [
    '扫描前端代码中的 `useMemo(() => ({ ... }), deps)` 与 `useMemo(() => [ ... ], deps)`。',
    '仅当依赖数组至少 2 项，且返回字面量内部没有 call/new/await/JSX 等潜在昂贵表达式时报告。',
  ],
  tags: ['code-style', 'react', 'readability'],
  defaultSeverity: 'info',
  run({ context, report }) {
    const section = report.section('Low-value React useMemo literal')
    for (const info of collectCodeStyleFiles(context, { frontendOnly: true })) {
      const sourceFile = getCachedSourceFile(context, info)
      walk(sourceFile, (node) => {
        const match = readLowValueUseMemo(node)
        if (!match) return

        const line = lineOf(sourceFile, node)
        section.add({
          ruleId: 'low-value-use-memo-literal',
          file: info.relativePath,
          line,
          message: `${info.relativePath}:${line}: "${snippetOf(sourceFile, node)}" 只是缓存轻量 ${match.literalKind} 字面量装配，却维护了 ${match.dependencyCount} 个依赖。请直接构造，只有下游明确依赖引用稳定性或计算很重时保留 useMemo。`,
          fingerprintInput: `${info.relativePath}::${line}::low-value-use-memo-literal::${match.literalKind}`,
          suggestion:
            '删除 useMemo 与依赖数组，保留对象/数组本体；若确实需要引用稳定性，请用 @arch-guard:suspend 标记暂缓并说明 consumer 边界。',
        })
      })
    }
  },
})

interface LowValueUseMemoMatch {
  dependencyCount: number
  literalKind: 'object' | 'array'
}

function readLowValueUseMemo(node: ts.Node): LowValueUseMemoMatch | undefined {
  if (!ts.isCallExpression(node)) return undefined
  if (!isUseMemoCallee(node.expression)) return undefined

  const returned = readReturnedExpression(node.arguments[0])
  if (!returned) return undefined

  const dependencyCount = readDependencyCount(node.arguments[1])
  if (dependencyCount < MinimumDependencyCount) return undefined

  const literal = unwrapParensExpression(returned)
  if (ts.isObjectLiteralExpression(literal)) return readLiteralMatch(literal, 'object', dependencyCount)
  if (ts.isArrayLiteralExpression(literal)) return readLiteralMatch(literal, 'array', dependencyCount)
  return undefined
}

function isUseMemoCallee(expression: ts.Expression): boolean {
  const unwrappedExpression = unwrapParensExpression(expression)
  if (ts.isIdentifier(unwrappedExpression)) return unwrappedExpression.text === 'useMemo'
  return (
    ts.isPropertyAccessExpression(unwrappedExpression) &&
    unwrappedExpression.name.text === 'useMemo'
  )
}

function readReturnedExpression(factory: ts.Expression | undefined): ts.Expression | undefined {
  if (!factory) return undefined
  const unwrappedFactory = unwrapParensExpression(factory)

  if (ts.isArrowFunction(unwrappedFactory)) return readConciseBodyExpression(unwrappedFactory.body)

  if (ts.isFunctionExpression(unwrappedFactory)) return readSingleReturnExpression(unwrappedFactory.body)

  return undefined
}

function readConciseBodyExpression(body: ts.ConciseBody): ts.Expression | undefined {
  if (ts.isBlock(body)) return readSingleReturnExpression(body)
  return body
}

function readSingleReturnExpression(block: ts.Block): ts.Expression | undefined {
  if (block.statements.length !== 1) return undefined

  const statement = block.statements[0]
  if (!statement || !ts.isReturnStatement(statement) || !statement.expression) return undefined
  return statement.expression
}

function readDependencyCount(dependencies: ts.Expression | undefined): number {
  if (!dependencies) return 0

  const unwrappedDependencies = unwrapParensExpression(dependencies)
  if (!ts.isArrayLiteralExpression(unwrappedDependencies)) return 0
  return unwrappedDependencies.elements.length
}

function readLiteralMatch(
  literal: ts.ObjectLiteralExpression | ts.ArrayLiteralExpression,
  literalKind: LowValueUseMemoMatch['literalKind'],
  dependencyCount: number
): LowValueUseMemoMatch | undefined {
  if (containsPotentiallyExpensiveExpression(literal)) return undefined
  return { dependencyCount, literalKind }
}

function containsPotentiallyExpensiveExpression(node: ts.Node): boolean {
  let found = false
  const visit = (current: ts.Node): void => {
    if (found) return
    if (current !== node && isPotentiallyExpensiveExpression(current)) {
      found = true
      return
    }
    ts.forEachChild(current, visit)
  }
  visit(node)
  return found
}

function isPotentiallyExpensiveExpression(node: ts.Node): boolean {
  return (
    ts.isCallExpression(node) ||
    ts.isNewExpression(node) ||
    ts.isAwaitExpression(node) ||
    ts.isTaggedTemplateExpression(node) ||
    ts.isJsxElement(node) ||
    ts.isJsxSelfClosingElement(node) ||
    ts.isJsxFragment(node)
  )
}

export { preferMeaningfulUseMemo }
