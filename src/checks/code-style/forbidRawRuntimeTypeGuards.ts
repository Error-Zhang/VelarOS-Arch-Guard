import { defineCheck } from '../../core/defineCheck'
import type { FixContext } from '../../core/fixContext'
import ts from 'typescript'

import { collectCodeStyleFiles, getCachedSourceFile, lineOf, snippetOf, walk } from './_shared'
import {
  shouldSkipTypeofNumberEqForFiniteAndPair,
  shouldSkipTypeofNumberEqForNumberOrNullTernary,
  shouldSkipTypeofNumberNeForFiniteOrPair,
} from './finiteNumberGuardChains'
import { CodeStyleFixPhase } from './fixPhases'
import {
  shouldSkipTypeofStringEqForNonBlankAndPair,
  shouldSkipTypeofStringEqForTrimmedStringOrEmptyTernary,
} from './nonBlankStringGuardChains'
import {
  shouldSkipBareArrayIsArrayCall,
  shouldSkipMergeTypeofObjectNotNull,
  shouldSkipTypeofObjectNotEqForRejectTriple,
  shouldSkipTypeofObjectStrictEqBinary,
} from './plainObjectRawAndTriple'

/**
 * 禁止业务代码用手写 `typeof … === '…'`（除 `'undefined'` 由 forbid-redundant-strict-literal-comparison 覆盖）、
 * `Array.isArray`，以及可合并的 `typeof x === 'object' && x !== null`；**整段**可交给 **`prefer-is-plain-object`**（`&&`/`||` 三连等）、**`prefer-is-finite-number-guard`**（`typeof 'number'` 与 **`Number.isFinite`** 的二连）、**`prefer-number-or-null-ternary`**（`typeof 'number'` / **`isNumber`** 与 **同式 + `null` 三元**）、**`prefer-is-non-blank-string-guard`**（`typeof 'string'` / **`isString`** 与 **trim 真值** 的二连）、或 **`prefer-trimmed-string-or-empty-ternary`**（`typeof 'string'` / **`isString`** 与 **trim + `''` 三元**）时，本条对相应子式 **跳过**，避免先被拆成中间态。
 *
 * 自动修复：`arch-guard run --fix` 或配置 `fix: true`（仍遵守按 rule 关闭 `fix: false`）。
 */
const forbidRawRuntimeTypeGuards = defineCheck({
  id: 'code-style/forbid-raw-runtime-type-guards',
  title: 'Forbid raw typeof / Array.isArray (use global isString / isArray / …)',
  description:
    '手写 `typeof` 与 string literal 比较（object 合并形态除外由本规则收拢为 isObject）、`Array.isArray` 应改为全局 isString/isNumber/…/isArray/isObject。',
  verifies: [
    '`typeof expr ===/!== primitive`（primitive 为 string/number/boolean/function/bigint/symbol/object）。',
    "`typeof expr === 'object' && expr !== null` 合并为 `isObject(expr)`。",
    '`Array.isArray(x)` → `isArray(x)`。',
  ],
  tags: ['code-style', 'type-guards'],
  defaultSeverity: 'error',
  run({ context, report }) {
    const section = report.section('Raw runtime type guards')
    for (const info of collectCodeStyleFiles(context)) {
      const sourceFile = getCachedSourceFile(context, info)
      const declaredIdentifiers = collectRuntimeDeclaredIdentifiers(sourceFile)

      walk(sourceFile, (node) => {
        if (
          ts.isBinaryExpression(node) &&
          node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
        ) {
          const merged = readTypeofObjectStrictNotNullMerge(node, sourceFile)
          if (merged) {
            if (shouldSkipMergeTypeofObjectNotNull(node, sourceFile)) return
            const line = lineOf(sourceFile, node)
            const replacement = `isObject(${formatGuardOperand(merged.expr, sourceFile)})`
            section.add({
              ruleId: 'merge-typeof-object-not-null',
              file: info.relativePath,
              line,
              message: `${info.relativePath}:${line}: "${snippetOf(sourceFile, node)}" — \`!== null\` 与 \`typeof … === 'object'\` 联写时冗余；同一值应整体写成 isObject(${formatGuardOperand(merged.expr, sourceFile)})（等价于 typeof === 'object' 且排除 null）。`,
              fingerprintInput: `${info.relativePath}::${line}::merge-typeof-object`,
              ...fixReplaceRange(info.relativePath, sourceFile, node, replacement),
              fixPhase: CodeStyleFixPhase.rawRuntimeTypeGuards,
            })
            return
          }
        }

        if (ts.isCallExpression(node) && isBareArrayIsArrayCall(node)) {
          if (shouldSkipBareArrayIsArrayCall(node, sourceFile)) return
          const arg = node.arguments[0]
          if (!arg) return
          const line = lineOf(sourceFile, node)
          const inner = formatGuardOperand(arg, sourceFile)
          const replacement = `isArray(${inner})`
          section.add({
            ruleId: 'array-is-array',
            file: info.relativePath,
            line,
            message: `${info.relativePath}:${line}: "${snippetOf(sourceFile, node)}" — use ${replacement}.`,
            fingerprintInput: `${info.relativePath}::${line}::array-is-array`,
            ...fixReplaceRange(info.relativePath, sourceFile, node, replacement),
            fixPhase: CodeStyleFixPhase.rawRuntimeTypeGuards,
          })
          return
        }

        if (!ts.isBinaryExpression(node)) return
        const op = node.operatorToken.kind
        if (
          op !== ts.SyntaxKind.EqualsEqualsEqualsToken &&
          op !== ts.SyntaxKind.ExclamationEqualsEqualsToken &&
          op !== ts.SyntaxKind.EqualsEqualsToken &&
          op !== ts.SyntaxKind.ExclamationEqualsToken
        ) return
        if (isUnderTypeofObjectMerge(node)) return

        const typeofPrim = readTypeofComparedToNonUndefinedString(node)
        if (!typeofPrim) return

        if (typeofPrim.primitive === 'undefined') return
        if (isUndeclaredIdentifierProbe(typeofPrim.operand, declaredIdentifiers)) return

        const line = lineOf(sourceFile, node)

        if (typeofPrim.primitive === 'object') {
          const inner = formatGuardOperand(typeofPrim.operand, sourceFile)
          const negated =
            op === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
            op === ts.SyntaxKind.ExclamationEqualsToken
          if (!negated && shouldSkipTypeofObjectStrictEqBinary(node, sourceFile)) return
          if (negated && shouldSkipTypeofObjectNotEqForRejectTriple(node, sourceFile)) return
          // `typeof x === 'object'` is true for `null`; `isObject(x)` matches `typeof === 'object' && x !== null`.
          // `typeof x !== 'object'`（无 null 前置条件时）须保留 `null` 与 `typeof` 一致：用 `!isObject(x) && !isNull(x)`。
          // 若同一表达式前已有 `!x` / `x == null` 等已排除 null，则多余 `&& !isNull(x)` 应删，见仓库内同类简化。
          const replacement = negated
            ? `!isObject(${inner}) && !isNull(${inner})`
            : `isObject(${inner})`
          section.add({
            ruleId: 'typeof-object-raw',
            file: info.relativePath,
            line,
            message: `${info.relativePath}:${line}: "${snippetOf(sourceFile, node)}" — use ${replacement} (avoids treating \`null\` like a non-null object). @arch-guard:suspend if you truly need raw typeof.`,
            fingerprintInput: `${info.relativePath}::${line}::typeof-object`,
            ...fixReplaceRange(info.relativePath, sourceFile, node, replacement),
            fixPhase: CodeStyleFixPhase.rawRuntimeTypeGuards,
          })
          return
        }

        const guardFn = typeofPrimitiveToGuard(typeofPrim.primitive)
        if (!guardFn) return

        const negated =
          op === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
          op === ts.SyntaxKind.ExclamationEqualsToken

        if (typeofPrim.primitive === 'number') {
          if (!negated && shouldSkipTypeofNumberEqForFiniteAndPair(node, sourceFile)) return
          if (!negated && shouldSkipTypeofNumberEqForNumberOrNullTernary(node, sourceFile)) return
          if (negated && shouldSkipTypeofNumberNeForFiniteOrPair(node, sourceFile)) return
        }

        if (typeofPrim.primitive === 'string') {
          if (!negated && shouldSkipTypeofStringEqForNonBlankAndPair(node, sourceFile)) return
          if (
            !negated &&
            shouldSkipTypeofStringEqForTrimmedStringOrEmptyTernary(node, sourceFile)
          ) return
        }

        const inner = formatGuardOperand(typeofPrim.operand, sourceFile)
        const replacement = negated ? `!${guardFn}(${inner})` : `${guardFn}(${inner})`
        section.add({
          ruleId: `typeof-${typeofPrim.primitive}`,
          file: info.relativePath,
          line,
          message: `${info.relativePath}:${line}: "${snippetOf(sourceFile, node)}" — use ${replacement}.`,
          fingerprintInput: `${info.relativePath}::${line}::typeof-${typeofPrim.primitive}`,
          ...fixReplaceRange(info.relativePath, sourceFile, node, replacement),
          fixPhase: CodeStyleFixPhase.rawRuntimeTypeGuards,
        })
      })
    }
  },
})

function typeofPrimitiveToGuard(primitive: string): string | undefined {
  switch (primitive) {
    case 'string':
      return 'isString'
    case 'number':
      return 'isNumber'
    case 'boolean':
      return 'isBoolean'
    case 'function':
      return 'isFunction'
    case 'bigint':
      return 'isBigInt'
    case 'symbol':
      return 'isSymbol'
    default:
      return undefined
  }
}

function fixReplaceRange(
  relativePath: string,
  sourceFile: ts.SourceFile,
  node: ts.Node,
  replacement: string
): { applyFix: (ctx: FixContext) => void; fixStartOffset: number } {
  const fixStartOffset = node.getFullStart()
  return {
    fixStartOffset,
    applyFix: (ctx) => {
      ctx.replaceTextRange(
        relativePath,
        { start: node.getFullStart(), end: node.getEnd() },
        replacement
      )
    },
  }
}

function isBareArrayIsArrayCall(node: ts.CallExpression): boolean {
  if (node.arguments.length !== 1) return false
  const ex = node.expression
  if (!ts.isPropertyAccessExpression(ex) || ex.name.text !== 'isArray') return false
  return ts.isIdentifier(ex.expression) && ex.expression.text === 'Array'
}

function readTypeofObjectStrictNotNullMerge(
  node: ts.BinaryExpression,
  sourceFile: ts.SourceFile
): { expr: ts.Expression } | undefined {
  const left = tryParseTypeofEqualsPrimitive(node.left, 'object')
  const rightNull = tryParseStrictInequalityNull(node.right)
  if (left && rightNull && expressionsTextEqual(left, rightNull, sourceFile)) return { expr: left }
  const leftNull = tryParseStrictInequalityNull(node.left)
  const rightObj = tryParseTypeofEqualsPrimitive(node.right, 'object')
  if (leftNull && rightObj && expressionsTextEqual(leftNull, rightObj, sourceFile)) return { expr: leftNull }
  return undefined
}

function tryParseTypeofEqualsPrimitive(
  node: ts.Node,
  primitive: string
): ts.Expression | undefined {
  if (!ts.isBinaryExpression(node)) return undefined
  const op = node.operatorToken.kind
  if (op !== ts.SyntaxKind.EqualsEqualsEqualsToken && op !== ts.SyntaxKind.EqualsEqualsToken)
    return undefined
  if (
    ts.isTypeOfExpression(node.left) &&
    ts.isStringLiteral(node.right) &&
    node.right.text === primitive
  ) return node.left.expression
  if (
    ts.isTypeOfExpression(node.right) &&
    ts.isStringLiteral(node.left) &&
    node.left.text === primitive
  ) return node.right.expression
  return undefined
}

function tryParseStrictInequalityNull(node: ts.Node): ts.Expression | undefined {
  if (!ts.isBinaryExpression(node)) return undefined
  if (node.operatorToken.kind !== ts.SyntaxKind.ExclamationEqualsEqualsToken) return undefined
  if (node.left.kind === ts.SyntaxKind.NullKeyword) return node.right
  if (node.right.kind === ts.SyntaxKind.NullKeyword) return node.left
  return undefined
}

function expressionsTextEqual(
  a: ts.Expression,
  b: ts.Expression,
  sourceFile: ts.SourceFile
): boolean {
  return a.getText(sourceFile) === b.getText(sourceFile)
}

function isUnderTypeofObjectMerge(node: ts.BinaryExpression): boolean {
  const parent = node.parent
  if (
    !ts.isBinaryExpression(parent) ||
    parent.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken
  ) return false
  return readTypeofObjectStrictNotNullMerge(parent, node.getSourceFile()) !== undefined
}

function readTypeofComparedToNonUndefinedString(
  node: ts.BinaryExpression
): { operand: ts.Expression; primitive: string } | undefined {
  const op = node.operatorToken.kind
  if (
    op !== ts.SyntaxKind.EqualsEqualsEqualsToken &&
    op !== ts.SyntaxKind.ExclamationEqualsEqualsToken &&
    op !== ts.SyntaxKind.EqualsEqualsToken &&
    op !== ts.SyntaxKind.ExclamationEqualsToken
  ) return undefined

  let typeofExpr: ts.TypeOfExpression | undefined
  let lit: ts.StringLiteral | undefined
  if (ts.isTypeOfExpression(node.left) && ts.isStringLiteral(node.right)) {
    typeofExpr = node.left
    lit = node.right
  } else if (ts.isTypeOfExpression(node.right) && ts.isStringLiteral(node.left)) {
    typeofExpr = node.right
    lit = node.left
  } else {
    return undefined
  }

  return { operand: typeofExpr.expression, primitive: lit.text }
}

function isUndeclaredIdentifierProbe(
  operand: ts.Expression,
  declaredIdentifiers: ReadonlySet<string>
): boolean {
  return ts.isIdentifier(operand) && !declaredIdentifiers.has(operand.text)
}

function collectRuntimeDeclaredIdentifiers(sourceFile: ts.SourceFile): ReadonlySet<string> {
  const names = new Set<string>()

  const addBindingName = (name: ts.BindingName): void => {
    if (ts.isIdentifier(name)) {
      names.add(name.text)
      return
    }
    for (const element of name.elements) {
      if (ts.isOmittedExpression(element)) continue
      addBindingName(element.name)
    }
  }

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause
      if (clause && !clause.isTypeOnly) {
        if (clause.name) names.add(clause.name.text)
        const bindings = clause.namedBindings
        if (bindings) {
          if (ts.isNamespaceImport(bindings)) {
            names.add(bindings.name.text)
          } else {
            for (const element of bindings.elements) {
              if (!element.isTypeOnly) names.add(element.name.text)
            }
          }
        }
      }
      return
    }
    if (ts.isImportEqualsDeclaration(node) && !node.isTypeOnly) {
      names.add(node.name.text)
      return
    }
    if (
      (ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isEnumDeclaration(node)) &&
      node.name
    ) {
      names.add(node.name.text)
    }
    if (ts.isVariableDeclaration(node)) {
      addBindingName(node.name)
    }
    if (ts.isParameter(node)) {
      addBindingName(node.name)
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return names
}

function formatGuardOperand(expression: ts.Expression, sourceFile: ts.SourceFile): string {
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

export { forbidRawRuntimeTypeGuards, readTypeofObjectStrictNotNullMerge }
