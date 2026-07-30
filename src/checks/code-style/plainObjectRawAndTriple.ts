import ts from 'typescript'

/**
 * 识别「手写 plain object」相关模式，供 **prefer-is-plain-object** 一步到位改写、**forbid-raw-runtime-type-guards** 跳过会打碎的子规则：
 * - **正链 `&&`**：`typeof x === 'object' && x !== null && !Array.isArray(x)`（等）→ `isPlainObject(x)`；
 * - **拒链 `||`**（扁平三段、顺序任意，语义等价 `!isPlainObject(x)`）：
 *   - **falsy / nullish**：`!x`，`x == null` / `x === null` / `x === undefined`（及对侧常量镜像），`typeof x === 'undefined'`（及 `==`），`isNull(x)` / `isUndefined(x)`，`!isPresent(x)`；
 *   - **非 object**：`!isObject(x)`，`typeof x !== 'object'` / `typeof x != 'object'`，`!isObject(x) && !isNull(x)`（及对称 `&&`）；
 *   - **数组**：`isArray(x)`，`Array.isArray(x)`。
 */

type RawAndPartKind = 'typeof-object' | 'not-null' | 'not-array'

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

function topOfAndChain(node: ts.BinaryExpression): ts.BinaryExpression {
  let current: ts.BinaryExpression = node
  while (
    ts.isBinaryExpression(current.parent) &&
    current.parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
    current.parent.left === current
  ) {
    current = current.parent
  }
  return current
}

function topOfOrChain(node: ts.BinaryExpression): ts.BinaryExpression {
  let current: ts.BinaryExpression = node
  while (
    ts.isBinaryExpression(current.parent) &&
    current.parent.operatorToken.kind === ts.SyntaxKind.BarBarToken &&
    current.parent.left === current
  ) {
    current = current.parent
  }
  return current
}

/** 自任意子孙 `||` 结点找到顶层 `||` 链根。 */
function enclosingTopOrChain(node: ts.Node): ts.BinaryExpression | undefined {
  let cur: ts.Node | undefined = node
  while (cur) {
    if (ts.isBinaryExpression(cur) && cur.operatorToken.kind === ts.SyntaxKind.BarBarToken) return topOfOrChain(cur)
    cur = cur.parent
  }
  return undefined
}

function flattenOrChainOperands(expr: ts.Expression): ts.Expression[] {
  const u = unwrapParens(expr)
  if (ts.isBinaryExpression(u) && u.operatorToken.kind === ts.SyntaxKind.BarBarToken) return [...flattenOrChainOperands(u.left), ...flattenOrChainOperands(u.right)]
  return [u]
}

/** 自任意子孙 `&&` 结点找到顶层 `&&` 链根。 */
function enclosingTopAndChain(node: ts.Node): ts.BinaryExpression | undefined {
  let cur: ts.Node | undefined = node
  while (cur) {
    if (ts.isBinaryExpression(cur) && cur.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) return topOfAndChain(cur)
    cur = cur.parent
  }
  return undefined
}

function flattenAndOperands(expr: ts.Expression): ts.Expression[] {
  const u = unwrapParens(expr)
  if (ts.isBinaryExpression(u) && u.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) return [...flattenAndOperands(u.left), u.right]
  return [u]
}

function tryParseTypeofEqualsObjectOperand(node: ts.Node): ts.Expression | undefined {
  if (!ts.isBinaryExpression(node)) return undefined
  const op = node.operatorToken.kind
  if (op !== ts.SyntaxKind.EqualsEqualsEqualsToken && op !== ts.SyntaxKind.EqualsEqualsToken) return undefined
  if (ts.isTypeOfExpression(node.left) && ts.isStringLiteral(node.right) && node.right.text === 'object') return node.left.expression
  if (ts.isTypeOfExpression(node.right) && ts.isStringLiteral(node.left) && node.left.text === 'object') return node.right.expression
  return undefined
}

function tryParseTypeofInequalityObjectOperand(node: ts.Node): ts.Expression | undefined {
  if (!ts.isBinaryExpression(node)) return undefined
  const op = node.operatorToken.kind
  if (op !== ts.SyntaxKind.ExclamationEqualsEqualsToken && op !== ts.SyntaxKind.ExclamationEqualsToken) return undefined
  if (ts.isTypeOfExpression(node.left) && ts.isStringLiteral(node.right) && node.right.text === 'object') return node.left.expression
  if (ts.isTypeOfExpression(node.right) && ts.isStringLiteral(node.left) && node.left.text === 'object') return node.right.expression
  return undefined
}

/** `typeof x === 'undefined'` / `typeof x == 'undefined'` */
function tryParseTypeofEqualityUndefinedOperand(node: ts.Node): ts.Expression | undefined {
  if (!ts.isBinaryExpression(node)) return undefined
  const op = node.operatorToken.kind
  if (op !== ts.SyntaxKind.EqualsEqualsEqualsToken && op !== ts.SyntaxKind.EqualsEqualsToken) return undefined
  if (ts.isTypeOfExpression(node.left) && ts.isStringLiteral(node.right) && node.right.text === 'undefined') return node.left.expression
  if (ts.isTypeOfExpression(node.right) && ts.isStringLiteral(node.left) && node.left.text === 'undefined') return node.right.expression
  return undefined
}

function tryParseStrictInequalityNullOperand(node: ts.Node): ts.Expression | undefined {
  if (!ts.isBinaryExpression(node)) return undefined
  if (node.operatorToken.kind !== ts.SyntaxKind.ExclamationEqualsEqualsToken) return undefined
  if (node.left.kind === ts.SyntaxKind.NullKeyword) return node.right
  if (node.right.kind === ts.SyntaxKind.NullKeyword) return node.left
  return undefined
}

function isBareArrayIsArrayCall(node: ts.CallExpression): boolean {
  if (node.arguments.length !== 1) return false
  const ex = node.expression
  if (!ts.isPropertyAccessExpression(ex) || ex.name.text !== 'isArray') return false
  return ts.isIdentifier(ex.expression) && ex.expression.text === 'Array'
}

/** `!isArray(x)` */
function readNegatedGlobalIsArrayArg(expr: ts.Expression): ts.Expression | undefined {
  const u = unwrapParens(expr)
  if (!ts.isPrefixUnaryExpression(u) || u.operator !== ts.SyntaxKind.ExclamationToken) return undefined
  const inner = unwrapParens(u.operand)
  if (!ts.isCallExpression(inner) || inner.arguments.length !== 1) return undefined
  if (!ts.isIdentifier(inner.expression) || inner.expression.text !== 'isArray') return undefined
  const arg = inner.arguments[0]
  if (!arg) return undefined
  return arg
}

/** `!isArray(x)` 或 `!Array.isArray(x)` */
function readNegatedArrayOperand(expr: ts.Expression): ts.Expression | undefined {
  const globalNeg = readNegatedGlobalIsArrayArg(expr)
  if (globalNeg) return globalNeg
  const u = unwrapParens(expr)
  if (!ts.isPrefixUnaryExpression(u) || u.operator !== ts.SyntaxKind.ExclamationToken) return undefined
  const inner = unwrapParens(u.operand)
  if (!ts.isCallExpression(inner) || !isBareArrayIsArrayCall(inner)) return undefined
  const arg = inner.arguments[0]
  if (!arg) return undefined
  return arg
}

function readNegatedGlobalUnaryCallArg(
  expr: ts.Expression,
  fn: 'isObject' | 'isNull'
): ts.Expression | undefined {
  const u = unwrapParens(expr)
  if (!ts.isPrefixUnaryExpression(u) || u.operator !== ts.SyntaxKind.ExclamationToken) return undefined
  const inner = unwrapParens(u.operand)
  if (!ts.isCallExpression(inner) || inner.arguments.length !== 1) return undefined
  if (!ts.isIdentifier(inner.expression) || inner.expression.text !== fn) return undefined
  const arg = inner.arguments[0]
  if (!arg) return undefined
  return arg
}

function extractEqNullOrUndefinedSubject(expr: ts.Expression): ts.Expression | undefined {
  const u = unwrapParens(expr)
  if (!ts.isBinaryExpression(u)) return undefined
  const op = u.operatorToken.kind
  if (op !== ts.SyntaxKind.EqualsEqualsToken && op !== ts.SyntaxKind.EqualsEqualsEqualsToken) return undefined
  if (u.left.kind === ts.SyntaxKind.NullKeyword || u.left.kind === ts.SyntaxKind.UndefinedKeyword) return unwrapParens(u.right)
  if (u.right.kind === ts.SyntaxKind.NullKeyword || u.right.kind === ts.SyntaxKind.UndefinedKeyword) return unwrapParens(u.left)
  return undefined
}

function extractIsNullOrUndefinedCallSubject(expr: ts.Expression): ts.Expression | undefined {
  const u = unwrapParens(expr)
  if (!ts.isCallExpression(u) || u.arguments.length !== 1) return undefined
  if (!ts.isIdentifier(u.expression)) return undefined
  if (u.expression.text !== 'isNull' && u.expression.text !== 'isUndefined') return undefined
  const arg = u.arguments[0]
  return arg ? unwrapParens(arg) : undefined
}

/**
 * 「falsy / nullish」槽：在拒链上与 `!x` 同地位的可合并写法（与 `isPlainObject` 定义及本规则集其余约定一致）。
 */
function extractFalsySlotSubject(expr: ts.Expression, _sourceFile: ts.SourceFile): ts.Expression | undefined {
  const u = unwrapParens(expr)

  const nullUndefCall = extractIsNullOrUndefinedCallSubject(u)
  if (nullUndefCall) return nullUndefCall

  const typeofUndef = tryParseTypeofEqualityUndefinedOperand(u)
  if (typeofUndef) return typeofUndef

  const eqNullUndef = extractEqNullOrUndefinedSubject(u)
  if (eqNullUndef) return eqNullUndef

  if (ts.isPrefixUnaryExpression(u) && u.operator === ts.SyntaxKind.ExclamationToken) {
    const op = unwrapParens(u.operand)
    if (
      ts.isCallExpression(op) &&
      op.arguments.length === 1 &&
      ts.isIdentifier(op.expression) &&
      op.expression.text === 'isPresent'
    ) {
      const arg = op.arguments[0]
      return arg ? unwrapParens(arg) : undefined
    }
    return op
  }

  return undefined
}

/** `!isObject(x) && !isNull(x)` 或对称顺序；与 `typeof x !== 'object'` 等价。 */
function readNotObjectAndNotNullSubject(expr: ts.Expression, sourceFile: ts.SourceFile): ts.Expression | undefined {
  const u = unwrapParens(expr)
  if (!ts.isBinaryExpression(u) || u.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken) return undefined
  const l = unwrapParens(u.left)
  const r = unwrapParens(u.right)
  const lo = readNegatedGlobalUnaryCallArg(l, 'isObject')
  const rn = readNegatedGlobalUnaryCallArg(r, 'isNull')
  if (lo && rn && expressionsTextEqual(lo, rn, sourceFile)) return lo
  const ln = readNegatedGlobalUnaryCallArg(l, 'isNull')
  const ro = readNegatedGlobalUnaryCallArg(r, 'isObject')
  if (ln && ro && expressionsTextEqual(ln, ro, sourceFile)) return ln
  return undefined
}

function extractNotObjectSlotSubject(expr: ts.Expression, sourceFile: ts.SourceFile): ts.Expression | undefined {
  const u = unwrapParens(expr)
  const negObj = readNegatedGlobalUnaryCallArg(u, 'isObject')
  if (negObj) return negObj
  const typeofNe = tryParseTypeofInequalityObjectOperand(u)
  if (typeofNe) return typeofNe
  return readNotObjectAndNotNullSubject(u, sourceFile)
}

function readPositiveArrayArg(expr: ts.Expression): ts.Expression | undefined {
  const u = unwrapParens(expr)
  if (!ts.isCallExpression(u) || u.arguments.length !== 1) return undefined
  const arg = u.arguments[0]
  if (!arg) return undefined
  if (ts.isIdentifier(u.expression) && u.expression.text === 'isArray') return arg
  if (isBareArrayIsArrayCall(u)) return arg
  return undefined
}

type RejectPlainOrRole = 'falsy' | 'notObject' | 'array'

const REJECT_PLAIN_OR_ROLE_PERMUTATIONS: RejectPlainOrRole[][] = [
  ['falsy', 'notObject', 'array'],
  ['falsy', 'array', 'notObject'],
  ['notObject', 'falsy', 'array'],
  ['notObject', 'array', 'falsy'],
  ['array', 'falsy', 'notObject'],
  ['array', 'notObject', 'falsy'],
]

function extractSubjectForRejectOrRole(
  part: ts.Expression,
  role: RejectPlainOrRole,
  sourceFile: ts.SourceFile
): ts.Expression | undefined {
  switch (role) {
    case 'falsy':
      return extractFalsySlotSubject(part, sourceFile)
    case 'notObject':
      return extractNotObjectSlotSubject(part, sourceFile)
    case 'array':
      return readPositiveArrayArg(part)
    default:
      return undefined
  }
}

/** `||` 上三连：falsy/nullish、非 object、数组三槽各一条；顺序任意；与 `!isPlainObject(x)` 等价。 */
function matchRejectPlainObjectOrTriple(parts: ts.Expression[], sourceFile: ts.SourceFile): ts.Expression | undefined {
  if (parts.length !== 3) return undefined

  for (const perm of REJECT_PLAIN_OR_ROLE_PERMUTATIONS) {
    const subjects: ts.Expression[] = []
    let ok = true
    for (let i = 0; i < 3; i += 1) {
      const role = perm[i]
      const part = parts[i]
      if (!role || !part) {
        ok = false
        break
      }
      const subj = extractSubjectForRejectOrRole(part, role, sourceFile)
      if (!subj) {
        ok = false
        break
      }
      subjects.push(subj)
    }
    if (!ok || subjects.length !== 3) continue
    const [s0, s1, s2] = subjects
    if (!s0 || !s1 || !s2) continue
    if (expressionsTextEqual(s0, s1, sourceFile) && expressionsTextEqual(s0, s2, sourceFile)) return s0
  }
  return undefined
}

function matchRejectPlainObjectOrDeMorganPair(parts: ts.Expression[], sourceFile: ts.SourceFile): ts.Expression | undefined {
  if (parts.length !== 2) return undefined
  const first = parts[0]
  const second = parts[1]
  if (!first || !second) return undefined
  const twoRoleOrders = [
    ['notObject', 'array'],
    ['array', 'notObject'],
  ] as const satisfies ReadonlyArray<readonly [RejectPlainOrRole, RejectPlainOrRole]>
  for (const [firstRole, secondRole] of twoRoleOrders) {
    const s0 = extractSubjectForRejectOrRole(first, firstRole, sourceFile)
    const s1 = extractSubjectForRejectOrRole(second, secondRole, sourceFile)
    if (s0 && s1 && expressionsTextEqual(s0, s1, sourceFile)) return s0
  }
  return undefined
}

function classifyRawAndPart(expr: ts.Expression): { kind: RawAndPartKind; subj: ts.Expression } | undefined {
  const u = unwrapParens(expr)

  const typeofSubj = tryParseTypeofEqualsObjectOperand(u)
  if (typeofSubj) return { kind: 'typeof-object', subj: typeofSubj }
  const notNullSubj = tryParseStrictInequalityNullOperand(u)
  if (notNullSubj) return { kind: 'not-null', subj: notNullSubj }
  const arrSubj = readNegatedArrayOperand(u)
  if (arrSubj) return { kind: 'not-array', subj: arrSubj }
  return undefined
}

function matchPlainObjectPositiveRawTriple(parts: ts.Expression[], sourceFile: ts.SourceFile): ts.Expression | undefined {
  if (parts.length !== 3) return undefined
  const kinds = new Set<RawAndPartKind>()
  let subj: ts.Expression | undefined

  for (const p of parts) {
    const c = classifyRawAndPart(p)
    if (!c) return undefined
    if (kinds.has(c.kind)) return undefined
    kinds.add(c.kind)
    if (!subj) {
      subj = c.subj
    } else if (!expressionsTextEqual(subj, c.subj, sourceFile)) return undefined
  }

  if (kinds.size !== 3 || !subj) return undefined
  return subj
}

function readTypeofObjectStrictNotNullMerge(node: ts.BinaryExpression, sourceFile: ts.SourceFile): { expr: ts.Expression } | undefined {
  const left = tryParseTypeofEqualsObjectOperand(unwrapParens(node.left))
  const rightNull = tryParseStrictInequalityNullOperand(unwrapParens(node.right))
  if (left && rightNull && expressionsTextEqual(left, rightNull, sourceFile)) return { expr: left }
  const leftNull = tryParseStrictInequalityNullOperand(unwrapParens(node.left))
  const rightObj = tryParseTypeofEqualsObjectOperand(unwrapParens(node.right))
  if (leftNull && rightObj && expressionsTextEqual(leftNull, rightObj, sourceFile)) return { expr: leftNull }
  return undefined
}

/** forbid-raw：`typeof&&!null` 合并会妨碍 isPlainObject 一步到位时跳过。 */
function shouldSkipMergeTypeofObjectNotNull(mergeNode: ts.BinaryExpression, sourceFile: ts.SourceFile): boolean {
  if (!readTypeofObjectStrictNotNullMerge(mergeNode, sourceFile)) return false
  const top = topOfAndChain(mergeNode)
  const parts = flattenAndOperands(top)
  for (let i = 0; i <= parts.length - 3; i += 1) {
    if (!matchPlainObjectPositiveRawTriple(parts.slice(i, i + 3), sourceFile)) continue
    const a = parts[i]!
    const b = parts[i + 1]!
    if (
      mergeNode.getStart(sourceFile) === a.getStart(sourceFile) &&
      mergeNode.getEnd() === b.getEnd()
    ) return true
  }
  return false
}

function shouldSkipBareArrayIsArrayInPositivePlainTriple(call: ts.CallExpression, sourceFile: ts.SourceFile): boolean {
  const bang = call.parent
  if (!ts.isPrefixUnaryExpression(bang) || bang.operator !== ts.SyntaxKind.ExclamationToken) return false
  const top = enclosingTopAndChain(bang)
  if (!top) return false
  const parts = flattenAndOperands(top)
  for (let i = 0; i <= parts.length - 3; i += 1) {
    if (!matchPlainObjectPositiveRawTriple(parts.slice(i, i + 3), sourceFile)) continue
    const third = parts[i + 2]!
    if (call.getStart(sourceFile) >= third.getStart(sourceFile) && call.getEnd() <= third.getEnd()) return true
  }
  return false
}

/** forbid-raw：`Array.isArray` → `isArray`：在 **正** plain `&&` 三连的 `!Array.isArray` 内，或在 **拒** plain `||` 三连的 **正** `Array.isArray` 臂上时跳过（由 prefer 一次替换整链）。 */
function shouldSkipBareArrayIsArrayCall(call: ts.CallExpression, sourceFile: ts.SourceFile): boolean {
  if (!isBareArrayIsArrayCall(call)) return false
  if (shouldSkipBareArrayIsArrayInPositivePlainTriple(call, sourceFile)) return true
  const topOr = enclosingTopOrChain(call)
  if (!topOr) return false
  const orParts = flattenOrChainOperands(topOr)
  for (let i = 0; i <= orParts.length - 3; i += 1) {
    const slice = orParts.slice(i, i + 3)
    const subjWindow = matchRejectPlainObjectOrTriple(slice, sourceFile)
    if (!subjWindow) continue
    if (windowContainsArrayCall(slice, subjWindow, call, sourceFile)) return true
  }
  for (let i = 0; i <= orParts.length - 2; i += 1) {
    const slice = orParts.slice(i, i + 2)
    const subjWindow = matchRejectPlainObjectOrDeMorganPair(slice, sourceFile)
    if (!subjWindow) continue
    if (windowContainsArrayCall(slice, subjWindow, call, sourceFile)) return true
  }
  return false
}

function windowContainsArrayCall(
  slice: ts.Expression[],
  subj: ts.Expression,
  call: ts.CallExpression,
  sourceFile: ts.SourceFile
): boolean {
  for (const part of slice) {
    const arrArg = readPositiveArrayArg(part)
    if (!arrArg || !expressionsTextEqual(arrArg, subj, sourceFile)) continue
    if (call.getStart(sourceFile) >= part.getStart(sourceFile) && call.getEnd() <= part.getEnd()) return true
  }
  return false
}

/** forbid-raw：`typeof x === 'object'` 单独改 isObject 会破坏三连时跳过。 */
function shouldSkipTypeofObjectStrictEqBinary(node: ts.BinaryExpression, sourceFile: ts.SourceFile): boolean {
  const op = node.operatorToken.kind
  if (op !== ts.SyntaxKind.EqualsEqualsEqualsToken && op !== ts.SyntaxKind.EqualsEqualsToken) return false
  if (!tryParseTypeofEqualsObjectOperand(unwrapParens(node))) return false
  const top = enclosingTopAndChain(node)
  if (!top) return false
  const parts = flattenAndOperands(top)
  for (let i = 0; i <= parts.length - 3; i += 1) {
    if (!matchPlainObjectPositiveRawTriple(parts.slice(i, i + 3), sourceFile)) continue
    for (let k = 0; k < 3; k += 1) {
      if (parts[i + k] === node) return true
    }
  }
  return false
}

/** forbid-raw：`typeof x !== 'object'` / `typeof x != 'object'` 在 **拒** plain `||` 三连或 **De Morgan 二连** 内时跳过。 */
function shouldSkipTypeofObjectNotEqForRejectTriple(node: ts.BinaryExpression, sourceFile: ts.SourceFile): boolean {
  const op = node.operatorToken.kind
  if (op !== ts.SyntaxKind.ExclamationEqualsEqualsToken && op !== ts.SyntaxKind.ExclamationEqualsToken) return false
  if (!tryParseTypeofInequalityObjectOperand(unwrapParens(node))) return false
  const topOr = enclosingTopOrChain(node)
  if (!topOr) return false
  const orParts = flattenOrChainOperands(topOr)
  for (let i = 0; i <= orParts.length - 3; i += 1) {
    const slice = orParts.slice(i, i + 3)
    if (!matchRejectPlainObjectOrTriple(slice, sourceFile)) continue
    for (const part of slice) {
      if (part === node) return true
    }
  }
  for (let i = 0; i <= orParts.length - 2; i += 1) {
    const slice = orParts.slice(i, i + 2)
    if (!matchRejectPlainObjectOrDeMorganPair(slice, sourceFile)) continue
    for (const part of slice) {
      if (part === node) return true
    }
  }
  return false
}

export {
  flattenAndOperands,
  flattenOrChainOperands,
  matchPlainObjectPositiveRawTriple,
  matchRejectPlainObjectOrDeMorganPair,
  matchRejectPlainObjectOrTriple,
  shouldSkipBareArrayIsArrayCall,
  shouldSkipMergeTypeofObjectNotNull,
  shouldSkipTypeofObjectNotEqForRejectTriple,
  shouldSkipTypeofObjectStrictEqBinary,
  topOfAndChain,
  topOfOrChain,
}
