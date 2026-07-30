import ts from 'typescript'

import { enclosingConditionalIfDirectCondition } from './_shared'
import { flattenAndOperands, flattenOrChainOperands, topOfAndChain, topOfOrChain } from './plainObjectRawAndTriple'

/**
 * `isFiniteNumber(x)`（`isNumber(x) && Number.isFinite(x)`）与 **De Morgan** `!isFiniteNumber(x)` 的扁平链识别；
 * 另含 **`isNumber(x) ? x : null`** / **`typeof`** 三元 → **`numberOrNull`**；
 * 供 **prefer-is-finite-number-guard**、**prefer-number-or-null-ternary** 与 **forbid-raw-runtime-type-guards** 跳过会破坏整段改写的 `typeof 'number'` 子式。
 */

function unwrapParens(expr: ts.Expression): ts.Expression {
  let e = expr
  while (ts.isParenthesizedExpression(e)) {
    e = e.expression
  }
  return e
}

function expressionsTextEqual(a: ts.Expression, b: ts.Expression, sourceFile: ts.SourceFile): boolean {
  return a.getText(sourceFile) === b.getText(sourceFile)
}

function enclosingTopAndChain(node: ts.Node): ts.BinaryExpression | undefined {
  let cur: ts.Node | undefined = node
  while (cur) {
    if (ts.isBinaryExpression(cur) && cur.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) return topOfAndChain(cur)
    cur = cur.parent
  }
  return undefined
}

function enclosingTopOrChain(node: ts.Node): ts.BinaryExpression | undefined {
  let cur: ts.Node | undefined = node
  while (cur) {
    if (ts.isBinaryExpression(cur) && cur.operatorToken.kind === ts.SyntaxKind.BarBarToken) return topOfOrChain(cur)
    cur = cur.parent
  }
  return undefined
}

function tryParseTypeofEqualsNumberOperand(node: ts.Node): ts.Expression | undefined {
  if (!ts.isBinaryExpression(node)) return undefined
  const op = node.operatorToken.kind
  if (op !== ts.SyntaxKind.EqualsEqualsEqualsToken && op !== ts.SyntaxKind.EqualsEqualsToken) return undefined
  if (ts.isTypeOfExpression(node.left) && ts.isStringLiteral(node.right) && node.right.text === 'number') return node.left.expression
  if (ts.isTypeOfExpression(node.right) && ts.isStringLiteral(node.left) && node.left.text === 'number') return node.right.expression
  return undefined
}

function tryParseTypeofInequalityNumberOperand(node: ts.Node): ts.Expression | undefined {
  if (!ts.isBinaryExpression(node)) return undefined
  const op = node.operatorToken.kind
  if (op !== ts.SyntaxKind.ExclamationEqualsEqualsToken && op !== ts.SyntaxKind.ExclamationEqualsToken) return undefined
  if (ts.isTypeOfExpression(node.left) && ts.isStringLiteral(node.right) && node.right.text === 'number') return node.left.expression
  if (ts.isTypeOfExpression(node.right) && ts.isStringLiteral(node.left) && node.left.text === 'number') return node.right.expression
  return undefined
}

function readGlobalIsNumberCallArg(expr: ts.Expression): ts.Expression | undefined {
  const u = unwrapParens(expr)
  if (!ts.isCallExpression(u) || u.arguments.length !== 1) return undefined
  if (!ts.isIdentifier(u.expression) || u.expression.text !== 'isNumber') return undefined
  const arg = u.arguments[0]
  return arg ? unwrapParens(arg) : undefined
}

function readNumberDotIsFiniteCallArg(expr: ts.Expression): ts.Expression | undefined {
  const u = unwrapParens(expr)
  if (!ts.isCallExpression(u) || u.arguments.length !== 1) return undefined
  const ex = u.expression
  if (!ts.isPropertyAccessExpression(ex) || ex.name.text !== 'isFinite') return undefined
  if (!ts.isIdentifier(ex.expression) || ex.expression.text !== 'Number') return undefined
  const arg = u.arguments[0]
  return arg ? unwrapParens(arg) : undefined
}

type AndFiniteRole = 'numGuard' | 'finite'

function extractAndFiniteSubject(part: ts.Expression, role: AndFiniteRole): ts.Expression | undefined {
  const u = unwrapParens(part)
  if (role === 'finite') return readNumberDotIsFiniteCallArg(u)
  const isn = readGlobalIsNumberCallArg(u)
  if (isn) return isn
  return tryParseTypeofEqualsNumberOperand(u)
}

/** `&&` 上二元：`isNumber`/`typeof==='number'` 与 `Number.isFinite`，顺序任意。 */
function matchFiniteNumberPositiveAndPair(parts: ts.Expression[], sourceFile: ts.SourceFile): ts.Expression | undefined {
  if (parts.length !== 2) return undefined
  const first = parts[0]
  const second = parts[1]
  if (!first || !second) return undefined
  const orders = [
    ['numGuard', 'finite'],
    ['finite', 'numGuard'],
  ] as const satisfies ReadonlyArray<readonly [AndFiniteRole, AndFiniteRole]>
  for (const [firstRole, secondRole] of orders) {
    const s0 = extractAndFiniteSubject(first, firstRole)
    const s1 = extractAndFiniteSubject(second, secondRole)
    if (s0 && s1 && expressionsTextEqual(s0, s1, sourceFile)) return s0
  }
  return undefined
}

type OrRejectFiniteRole = 'notNum' | 'notFinite'

function readNegatedNumberIsFiniteArg(expr: ts.Expression): ts.Expression | undefined {
  const u = unwrapParens(expr)
  if (!ts.isPrefixUnaryExpression(u) || u.operator !== ts.SyntaxKind.ExclamationToken) return undefined
  return readNumberDotIsFiniteCallArg(unwrapParens(u.operand))
}

function readNegatedIsNumberArg(expr: ts.Expression): ts.Expression | undefined {
  const u = unwrapParens(expr)
  if (!ts.isPrefixUnaryExpression(u) || u.operator !== ts.SyntaxKind.ExclamationToken) return undefined
  return readGlobalIsNumberCallArg(unwrapParens(u.operand))
}

function extractOrRejectFiniteSubject(part: ts.Expression, role: OrRejectFiniteRole): ts.Expression | undefined {
  const u = unwrapParens(part)
  if (role === 'notFinite') return readNegatedNumberIsFiniteArg(u)
  const negIsn = readNegatedIsNumberArg(u)
  if (negIsn) return negIsn
  return tryParseTypeofInequalityNumberOperand(u)
}

/** `||` 上二元：`!isNumber`/`typeof !== 'number'` 与 `!Number.isFinite`，顺序任意。 */
function matchFiniteNumberRejectOrPair(parts: ts.Expression[], sourceFile: ts.SourceFile): ts.Expression | undefined {
  if (parts.length !== 2) return undefined
  const first = parts[0]
  const second = parts[1]
  if (!first || !second) return undefined
  const orders = [
    ['notNum', 'notFinite'],
    ['notFinite', 'notNum'],
  ] as const satisfies ReadonlyArray<readonly [OrRejectFiniteRole, OrRejectFiniteRole]>
  for (const [firstRole, secondRole] of orders) {
    const s0 = extractOrRejectFiniteSubject(first, firstRole)
    const s1 = extractOrRejectFiniteSubject(second, secondRole)
    if (s0 && s1 && expressionsTextEqual(s0, s1, sourceFile)) return s0
  }
  return undefined
}

function sliceContainsNode(slice: ts.Expression[], node: ts.Expression): boolean {
  return slice.includes(node)
}

/** forbid-raw：`typeof x === 'number'`（含 `==`）在 **正** `&&` 二元（收 `isFiniteNumber`）内时跳过。 */
function shouldSkipTypeofNumberEqForFiniteAndPair(node: ts.BinaryExpression, sourceFile: ts.SourceFile): boolean {
  const op = node.operatorToken.kind
  if (op !== ts.SyntaxKind.EqualsEqualsEqualsToken && op !== ts.SyntaxKind.EqualsEqualsToken) return false
  if (!tryParseTypeofEqualsNumberOperand(unwrapParens(node))) return false
  const top = enclosingTopAndChain(node)
  if (!top) return false
  const parts = flattenAndOperands(top)
  for (let i = 0; i <= parts.length - 2; i += 1) {
    const slice = parts.slice(i, i + 2)
    if (!matchFiniteNumberPositiveAndPair(slice, sourceFile)) continue
    if (sliceContainsNode(slice, node)) return true
  }
  return false
}

/** forbid-raw：`typeof x !== 'number'`（含 `!=`）在 **拒** `||` 二元内时跳过。 */
function shouldSkipTypeofNumberNeForFiniteOrPair(node: ts.BinaryExpression, sourceFile: ts.SourceFile): boolean {
  const op = node.operatorToken.kind
  if (op !== ts.SyntaxKind.ExclamationEqualsEqualsToken && op !== ts.SyntaxKind.ExclamationEqualsToken) return false
  if (!tryParseTypeofInequalityNumberOperand(unwrapParens(node))) return false
  const topOr = enclosingTopOrChain(node)
  if (!topOr) return false
  const orParts = flattenOrChainOperands(topOr)
  for (let i = 0; i <= orParts.length - 2; i += 1) {
    const slice = orParts.slice(i, i + 2)
    if (!matchFiniteNumberRejectOrPair(slice, sourceFile)) continue
    if (sliceContainsNode(slice, node)) return true
  }
  return false
}

function extractNumberGuardSubject(part: ts.Expression): ts.Expression | undefined {
  const isn = readGlobalIsNumberCallArg(part)
  if (isn) return isn
  const u = unwrapParens(part)
  if (!ts.isBinaryExpression(u)) return undefined
  return tryParseTypeofEqualsNumberOperand(u)
}

function isStrictNullLiteralExpression(expr: ts.Expression): boolean {
  return unwrapParens(expr).kind === ts.SyntaxKind.NullKeyword
}

/** `isNumber(x)` / `typeof x === 'number'` + 同式 + `: null` 三元。 */
function matchNumberOrNullTernary(node: ts.ConditionalExpression, sourceFile: ts.SourceFile): ts.Expression | undefined {
  const subjCond = extractNumberGuardSubject(node.condition)
  if (!subjCond) return undefined
  if (!expressionsTextEqual(subjCond, unwrapParens(node.whenTrue), sourceFile)) return undefined
  if (!isStrictNullLiteralExpression(node.whenFalse)) return undefined
  return subjCond
}

/** forbid-raw：`typeof x === 'number'` 为 **`numberOrNull`** 三元条件时跳过。 */
function shouldSkipTypeofNumberEqForNumberOrNullTernary(node: ts.BinaryExpression, sourceFile: ts.SourceFile): boolean {
  const op = node.operatorToken.kind
  if (op !== ts.SyntaxKind.EqualsEqualsEqualsToken && op !== ts.SyntaxKind.EqualsEqualsToken) return false
  if (!tryParseTypeofEqualsNumberOperand(unwrapParens(node))) return false
  const ce = enclosingConditionalIfDirectCondition(node)
  if (!ce) return false
  return matchNumberOrNullTernary(ce, sourceFile) !== undefined
}

export {
  expressionsTextEqual,
  matchFiniteNumberPositiveAndPair,
  matchFiniteNumberRejectOrPair,
  matchNumberOrNullTernary,
  shouldSkipTypeofNumberEqForFiniteAndPair,
  shouldSkipTypeofNumberEqForNumberOrNullTernary,
  shouldSkipTypeofNumberNeForFiniteOrPair,
  unwrapParens,
}
