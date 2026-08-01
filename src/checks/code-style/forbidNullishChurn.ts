import { defineCheck } from '../../core/defineCheck'
import type { FixContext } from '../../core/fixContext'
import ts from 'typescript'

import { fixReplaceSpan, type HelperImportSources, readHelperImportSources } from './_fix'
import { collectCodeStyleFiles, getCachedSourceFile, lineOf, snippetOf, walk } from './_shared'
import { CodeStyleFixPhase } from './fixPhases'

/**
 * 禁止在业务逻辑里反复内联改写缺席值。
 *
 * 需要收敛到 nullable 边界时使用全局 **`toNullable(expr)`**。
 *
 * 其它 absence 语义仍应在专用边界 helper（normalizer / adapter / mapper）里一次处理，
 * 避免在业务逻辑里反复转换或把 `undefined` 偷偷换成 `null` 的语义漂移。
 *
 * 合并了旧的两段子规则：
 *  - fallback churn。
 *  - presence ternary 与单参 IIFE 等价式。
 */
const forbidNullishChurn = defineCheck({
  id: 'code-style/forbid-nullish-churn',
  title: 'Forbid inline null/undefined normalization churn',
  description:
    '业务代码不要内联做 null/undefined 转换；归一到 `null` 时用全局 toNullable（extensions），其余在边界 helper 处理。',
  verifies: [
    '识别 `?? null`、`?? undefined` 这种 fallback churn（`?? null` 的修复面：toNullable）。',
    '识别 `x == null ? null : x` 这种 nullish ternary churn。',
    '识别 **`isPresent(x) ? x : null`** 及 **单参 IIFE** 等价式 → **`toNullable(x)`**（可 **`arch-guard run --fix`**）。',
    '识别 **`toOptional(x ? x : undefined)`** → **`toOptional(x)`**（可 **`arch-guard run --fix`**）。',
    '识别 **`toOptional(isNumber(x) ? x : undefined)`** → **`toOptional(numberOrNull(x))`**（可 **`arch-guard run --fix`**）。',
  ],
  tags: ['code-style', 'nullish-discipline'],
  defaultSeverity: 'error',
  run({ context, report }) {
    const section = report.section('Nullish normalization churn')
    const helpers = readHelperImportSources(context)
    for (const info of collectCodeStyleFiles(context)) {
      const sourceFile = getCachedSourceFile(context, info)
      walk(sourceFile, (node) => {
        if (ts.isConditionalExpression(node)) {
          const enclosingIife = enclosingIsPresentNullIifeCall(node)
          if (enclosingIife && readIsPresentNullIifeToNullable(enclosingIife, sourceFile)) return
          const presentCoalesce = readIsPresentNullCoalesce(node, sourceFile)
          if (presentCoalesce) {
            const line = lineOf(sourceFile, node)
            const snippet = snippetOf(sourceFile, node)
            const innerText = presentCoalesce.inner.getText(sourceFile)
            const replacement = `toNullable(${innerText})`
            section.add({
              ruleId: 'is-present-null-ternary-to-nullable',
              file: info.relativePath,
              line,
              message: `${info.relativePath}:${line}: "${snippet}" — \`isPresent(x) ? x : null\` 请写成 **\`${replacement}\`**（与 \`?? null\` 同语义）。`,
              fingerprintInput: `${info.relativePath}::${line}::is-present-to-nullable`,
              fixPhase: CodeStyleFixPhase.preferToNullableOverIsPresentNullTernary,
              fixStartOffset: node.getStart(sourceFile),
              applyFix: fixReplaceText(info.relativePath, sourceFile, node, replacement, helpers),
            })
            return
          }
        }

        if (ts.isCallExpression(node)) {
          const toOptionalSelf = readToOptionalTruthySelfTernary(node, sourceFile)
          if (toOptionalSelf) {
            const line = lineOf(sourceFile, node)
            const snippet = snippetOf(sourceFile, node)
            const replacement = `toOptional(${toOptionalSelf.getText(sourceFile)})`
            section.add({
              ruleId: 'to-optional-truthy-self-ternary',
              file: info.relativePath,
              line,
              message: `${info.relativePath}:${line}: "${snippet}" — \`toOptional(x ? x : undefined)\` 请直接写成 **\`${replacement}\`**。`,
              fingerprintInput: `${info.relativePath}::${line}::to-optional-truthy-self`,
              fixPhase: CodeStyleFixPhase.simplifyToOptionalTruthySelfTernary,
              fixStartOffset: node.getStart(sourceFile),
              applyFix: fixReplaceText(info.relativePath, sourceFile, node, replacement, helpers),
            })
            return
          }

          const toOptionalNumber = readToOptionalNumberGuardSelfTernary(node, sourceFile)
          if (toOptionalNumber) {
            const line = lineOf(sourceFile, node)
            const snippet = snippetOf(sourceFile, node)
            const replacement = `toOptional(numberOrNull(${toOptionalNumber.getText(sourceFile)}))`
            section.add({
              ruleId: 'to-optional-number-guard-self-ternary',
              file: info.relativePath,
              line,
              message: `${info.relativePath}:${line}: "${snippet}" — \`toOptional(isNumber(x) ? x : undefined)\` 请写成 **\`${replacement}\`**。`,
              fingerprintInput: `${info.relativePath}::${line}::to-optional-number-guard-self`,
              fixPhase: CodeStyleFixPhase.simplifyToOptionalTruthySelfTernary,
              fixStartOffset: node.getStart(sourceFile),
              applyFix: fixReplaceText(info.relativePath, sourceFile, node, replacement, helpers),
            })
            return
          }

          const iifeArg = readIsPresentNullIifeToNullable(node, sourceFile)
          if (iifeArg) {
            const line = lineOf(sourceFile, node)
            const snippet = snippetOf(sourceFile, node)
            const replacement = `toNullable(${iifeArg.getText(sourceFile)})`
            section.add({
              ruleId: 'is-present-null-iife-to-nullable',
              file: info.relativePath,
              line,
              message: `${info.relativePath}:${line}: "${snippet}" — IIFE 形式的 \`(v)=>(isPresent(v)?v:null)(expr)\` 请写成 **\`${replacement}\`**。`,
              fingerprintInput: `${info.relativePath}::${line}::is-present-iife-to-nullable`,
              fixPhase: CodeStyleFixPhase.preferToNullableOverIsPresentNullTernary,
              fixStartOffset: node.getStart(sourceFile),
              applyFix: fixReplaceText(info.relativePath, sourceFile, node, replacement, helpers),
            })
            return
          }
        }

        const fallback = readNullishFallback(node)
        if (fallback) {
          const line = lineOf(sourceFile, node)
          const fixHint =
            fallback === 'null'
              ? ' Use toNullable(...) instead — a named export of @velaros-ai/core.'
              : ' Keep the existing value or normalize at a boundary helper.'
          section.add({
            ruleId: 'fallback-to-nullish',
            file: info.relativePath,
            line,
            message: `${info.relativePath}:${line}: "${snippetOf(sourceFile, node)}" falls back to ${fallback}.${fixHint}`,
            fingerprintInput: `${info.relativePath}::${line}::fallback::${fallback}`,
          })
          return
        }
        const ternary = readNullishTernaryChurn(sourceFile, node)
        if (ternary) {
          const line = lineOf(sourceFile, node)
          section.add({
            ruleId: 'ternary-nullish-churn',
            file: info.relativePath,
            line,
            message: `${info.relativePath}:${line}: "${snippetOf(sourceFile, node)}" converts ${ternary.from} to ${ternary.to}. If the goal is Nullable<T>, use global toNullable(...); otherwise isolate conversion in a boundary helper.`,
            fingerprintInput: `${info.relativePath}::${line}::ternary::${ternary.from}->${ternary.to}`,
          })
        }
      })
    }
  },
})

function getNullishKind(node: ts.Node): 'null' | 'undefined' | undefined {
  if (node.kind === ts.SyntaxKind.NullKeyword) return 'null'
  if (ts.isIdentifier(node) && node.text === 'undefined') return 'undefined'
  if (ts.isVoidExpression(node)) return 'undefined'
  return undefined
}

function readNullishFallback(node: ts.Node): 'null' | 'undefined' | undefined {
  if (!ts.isBinaryExpression(node)) return undefined
  if (node.operatorToken.kind !== ts.SyntaxKind.QuestionQuestionToken) return undefined
  return getNullishKind(node.right)
}

interface NullishComparison {
  expressionText: string
  isEquality: boolean
  nullishKind: 'null' | 'undefined'
}

function readNullishComparison(
  sourceFile: ts.SourceFile,
  node: ts.Node
): NullishComparison | undefined {
  if (!ts.isBinaryExpression(node)) return undefined
  const kind = node.operatorToken.kind
  const isEqualityOp =
    kind === ts.SyntaxKind.EqualsEqualsToken || kind === ts.SyntaxKind.EqualsEqualsEqualsToken
  const isInequalityOp =
    kind === ts.SyntaxKind.ExclamationEqualsToken ||
    kind === ts.SyntaxKind.ExclamationEqualsEqualsToken
  if (!isEqualityOp && !isInequalityOp) return undefined
  const leftNullish = getNullishKind(node.left)
  const rightNullish = getNullishKind(node.right)
  if (!leftNullish && !rightNullish) return undefined
  const expressionNode = leftNullish ? node.right : node.left
  return {
    expressionText: expressionNode.getText(sourceFile),
    isEquality: isEqualityOp,
    nullishKind: (leftNullish ?? rightNullish)!,
  }
}

function unwrapExpr(expr: ts.Expression): ts.Expression {
  let e = expr
  while (ts.isParenthesizedExpression(e)) {
    e = e.expression
  }
  return e
}

function readIsPresentNullCoalesce(
  node: ts.ConditionalExpression,
  sourceFile: ts.SourceFile
): { inner: ts.Expression } | undefined {
  if (getNullishKind(unwrapExpr(node.whenFalse)) !== 'null') return undefined
  const cond = unwrapExpr(node.condition)
  if (!ts.isCallExpression(cond)) return undefined
  const callee = unwrapExpr(cond.expression)
  if (!ts.isIdentifier(callee) || callee.text !== 'isPresent') return undefined
  if (cond.arguments.length !== 1) return undefined
  const condArg = cond.arguments[0]
  if (!condArg) return undefined
  const inner = unwrapExpr(condArg)
  const whenTrue = unwrapExpr(node.whenTrue)
  if (inner.getText(sourceFile) !== whenTrue.getText(sourceFile)) return undefined
  return { inner }
}

function readToOptionalTruthySelfTernary(
  call: ts.CallExpression,
  sourceFile: ts.SourceFile
): ts.Expression | undefined {
  const ternary = readToOptionalUndefinedTernary(call)
  if (!ternary) return undefined

  const condition = unwrapExpr(ternary.condition)
  const whenTrue = unwrapExpr(ternary.whenTrue)
  if (condition.getText(sourceFile) !== whenTrue.getText(sourceFile)) return undefined
  return condition
}

function readToOptionalNumberGuardSelfTernary(
  call: ts.CallExpression,
  sourceFile: ts.SourceFile
): ts.Expression | undefined {
  const ternary = readToOptionalUndefinedTernary(call)
  if (!ternary) return undefined

  const condition = unwrapExpr(ternary.condition)
  if (!ts.isCallExpression(condition)) return undefined
  const callee = unwrapExpr(condition.expression)
  if (!ts.isIdentifier(callee) || callee.text !== 'isNumber') return undefined
  if (condition.arguments.length !== 1) return undefined

  const guardArg = condition.arguments[0]
  if (!guardArg) return undefined
  const candidate = unwrapExpr(guardArg)
  const whenTrue = unwrapExpr(ternary.whenTrue)
  if (candidate.getText(sourceFile) !== whenTrue.getText(sourceFile)) return undefined
  return candidate
}

function readToOptionalUndefinedTernary(
  call: ts.CallExpression
): ts.ConditionalExpression | undefined {
  const callee = unwrapExpr(call.expression)
  if (!ts.isIdentifier(callee) || callee.text !== 'toOptional') return undefined
  if (call.arguments.length !== 1) return undefined

  const argument = call.arguments[0]
  if (!argument) return undefined
  const ternary = unwrapExpr(argument)
  if (!ts.isConditionalExpression(ternary)) return undefined
  if (getNullishKind(unwrapExpr(ternary.whenFalse)) !== 'undefined') return undefined
  return ternary
}

function enclosingIsPresentNullIifeCall(
  node: ts.ConditionalExpression
): ts.CallExpression | undefined {
  let p: ts.Node = node.parent
  while (ts.isParenthesizedExpression(p)) p = p.parent
  if (!ts.isArrowFunction(p)) return undefined
  const arrow = p
  if (!ts.isExpression(arrow.body)) return undefined
  if (unwrapExpr(arrow.body) !== node) return undefined
  let outer: ts.Node = arrow.parent
  while (ts.isParenthesizedExpression(outer)) outer = outer.parent
  if (!ts.isCallExpression(outer)) return undefined
  if (unwrapExpr(outer.expression) !== arrow) return undefined
  if (outer.arguments.length !== 1) return undefined
  return outer
}

function readIsPresentNullIifeToNullable(
  call: ts.CallExpression,
  sourceFile: ts.SourceFile
): ts.Expression | undefined {
  if (call.arguments.length !== 1) return undefined
  const callee = unwrapExpr(call.expression)
  if (!ts.isArrowFunction(callee)) return undefined
  if (callee.parameters.length !== 1) return undefined
  const param = callee.parameters[0]
  if (!param || !ts.isIdentifier(param.name)) return undefined
  if (!ts.isExpression(callee.body)) return undefined
  const body = unwrapExpr(callee.body)
  if (!ts.isConditionalExpression(body)) return undefined
  const coalesce = readIsPresentNullCoalesce(body, sourceFile)
  if (!coalesce) return undefined
  const innerId = unwrapExpr(coalesce.inner)
  if (!ts.isIdentifier(innerId) || innerId.text !== param.name.text) return undefined
  const callArg = call.arguments[0]
  return callArg ? unwrapExpr(callArg) : undefined
}

function fixReplaceText(
  relativePath: string,
  sourceFile: ts.SourceFile,
  node: ts.Node,
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

function readNullishTernaryChurn(
  sourceFile: ts.SourceFile,
  node: ts.Node
): { from: string; to: string } | undefined {
  if (!ts.isConditionalExpression(node)) return undefined
  const comparison = readNullishComparison(sourceFile, node.condition)
  if (!comparison) return undefined
  const nullishBranch = comparison.isEquality ? node.whenTrue : node.whenFalse
  const nonNullishBranch = comparison.isEquality ? node.whenFalse : node.whenTrue
  const nullishBranchKind = getNullishKind(nullishBranch)
  if (!nullishBranchKind) return undefined
  if (nullishBranchKind === comparison.nullishKind) return undefined
  if (nonNullishBranch.getText(sourceFile) !== comparison.expressionText) return undefined
  return { from: comparison.nullishKind, to: nullishBranchKind }
}

export { forbidNullishChurn }
