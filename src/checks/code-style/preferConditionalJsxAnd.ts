import { defineCheck } from '../../core/defineCheck'
import type { FixContext } from '../../core/fixContext'
import ts from 'typescript'

import { formatConditionForAnd, formatNegatedCondition } from './_booleanExpression'
import {
  collectCodeStyleFiles,
  getCachedSourceFile,
  lineOf,
  snippetOf,
  unwrapParensExpression,
  walk,
} from './_shared'
import { CodeStyleFixPhase } from './fixPhases'

/**
 * JSX 条件渲染只需要表达“渲染或不渲染”时，用 `&&` 比 `? … : null` 更短。
 *
 * 非布尔条件必须先转成 boolean，避免 React 把 `0` 等值渲染出来。
 *
 * 只在 **JSX 子表达式** `{...}` 位置生效：那里子节点类型是 `ReactNode`，接受 `false`。
 * `return`、变量赋值、`ReactElement | null` 的 render prop / 组件返回等位置**不改**——
 * 那里 `cond && <JSX/>` 会退化成 `false | Element`，与 `ReactElement | null` 不兼容造成
 * 类型错误（历史上该规则在这些位置误改并把源码改坏过）。
 */
const preferConditionalJsxAnd = defineCheck({
  id: 'code-style/prefer-conditional-jsx-and',
  title: 'Prefer && for conditional JSX',
  description:
    'JSX 条件渲染不要写 `cond ? <X /> : null`；用 `cond && <X />`，非布尔条件用 `!!cond && <X />`。',
  verifies: [
    '识别 `cond ? <JSX /> : null` 与 `cond ? null : <JSX />`。',
    '明显 boolean 条件保持原样，非布尔 truthy 条件自动加 `!!`。',
    '不处理非 JSX 分支、非 null fallback 或多分支表达式。',
    'arch-guard run --fix 自动替换。',
  ],
  tags: ['code-style', 'frontend'],
  defaultSeverity: 'error',
  run({ context, report }) {
    const section = report.section('Prefer conditional JSX &&')
    for (const info of collectCodeStyleFiles(context, { frontendOnly: true })) {
      if (!info.relativePath.endsWith('.tsx')) continue
      const sourceFile = getCachedSourceFile(context, info)
      walk(sourceFile, (node) => {
        if (!ts.isConditionalExpression(node)) return
        if (!isJsxChildConditional(node)) return
        if (hasFixableConditionalAncestor(node, sourceFile)) return
        const replacement = readConditionalJsxReplacement(node, sourceFile)
        if (!replacement) return

        const line = lineOf(sourceFile, node)
        section.add({
          ruleId: 'jsx-ternary-null-to-and',
          file: info.relativePath,
          line,
          message: `${info.relativePath}:${line}: "${snippetOf(sourceFile, node)}" — 条件 JSX 请写成 **${replacement}**（可 \`arch-guard run --fix\`）。`,
          fingerprintInput: `${info.relativePath}::${line}::jsx-ternary-null-to-and`,
          fixPhase: CodeStyleFixPhase.preferConditionalJsxAnd,
          fixStartOffset: node.getStart(sourceFile),
          applyFix: fixReplaceText(info.relativePath, sourceFile, node, replacement),
        })
      })
    }
  },
})

/**
 * 条件表达式是否直接位于 JSX 子表达式 `{...}` 里（可能被括号包裹）。
 * 只有子节点位置的 `ReactNode` 才接受 `false`，`&&` 改写才等价且类型安全。
 */
function isJsxChildConditional(node: ts.ConditionalExpression): boolean {
  let parent: ts.Node | undefined = node.parent
  while (parent && ts.isParenthesizedExpression(parent)) {
    parent = parent.parent
  }
  if (!parent || !ts.isJsxExpression(parent)) return false

  // JsxExpression 的父节点：子表达式位置是 JsxElement / JsxFragment；属性位置是 JsxAttribute（排除）。
  const container = parent.parent
  return !!container && (ts.isJsxElement(container) || ts.isJsxFragment(container))
}

function hasFixableConditionalAncestor(
  node: ts.ConditionalExpression,
  sourceFile: ts.SourceFile
): boolean {
  let current: ts.Node | undefined = node.parent
  while (current) {
    if (
      ts.isConditionalExpression(current) &&
      isJsxChildConditional(current) &&
      readConditionalJsxReplacement(current, sourceFile)
    ) return true
    current = current.parent
  }
  return false
}

function readConditionalJsxReplacement(
  node: ts.ConditionalExpression,
  sourceFile: ts.SourceFile
): string | undefined {
  const whenTrue = unwrapParensExpression(node.whenTrue)
  const whenFalse = unwrapParensExpression(node.whenFalse)

  if (isNullLiteral(whenFalse) && isJsxExpression(whenTrue)) return `${formatConditionForAnd(node.condition, sourceFile)} && ${node.whenTrue.getText(sourceFile)}`
  if (isNullLiteral(whenTrue) && isJsxExpression(whenFalse)) return `${formatNegatedCondition(node.condition, sourceFile)} && ${node.whenFalse.getText(sourceFile)}`
  return undefined
}

function isNullLiteral(node: ts.Expression): boolean {
  return node.kind === ts.SyntaxKind.NullKeyword
}

function isJsxExpression(node: ts.Expression): boolean {
  return ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)
}

function fixReplaceText(
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

export { preferConditionalJsxAnd }
