import { defineCheck } from '../../core/defineCheck'
import ts from 'typescript'

import { collectCodeStyleFiles, getCachedSourceFile, lineOf, snippetOf, walk } from './_shared'

/**
 * 守卫后仍断言门：`isObject(x)` 收窄到 `object` 之后又写 `x as Record<string, unknown>`
 * 才能读字段——断言把类型系统从这一步踢出去了，字段拼错、形状变了都不会报。
 *
 * `isObject` 只保证「非 null 的 object」（含数组、Date、类实例），所以它之后必然还要断言；
 * `isPlainObject`（= `isRecord`，core 已有）直接收窄成 `Record<string, unknown>`，
 * 换掉守卫就不再需要断言，字段读取重新受 TS 管辖。
 *
 * 判定：同一文件里既有 `isObject(P)` 又有 `P as Record<string, unknown>`（P 为同一标识符或
 * 同一属性路径），在断言处计一条。**不覆盖** `isObject` 的合法用法——真要接受数组 / 类实例
 * 而后续没有 Record 断言的，本门不看。
 *
 * 软性计数门（plugin 默认把 code-style 降一级）：存量冻结、新增在 CI 日志可见，
 * 不硬拦以免误伤「断言目标不是 Record 形态」的边界写法。
 */
const preferIsPlainObjectOverGuardedRecordCast = defineCheck({
  id: 'code-style/prefer-is-plain-object-over-guarded-record-cast',
  title: 'Prefer isPlainObject over isObject + Record assertion',
  description:
    '`isObject(x)` 守卫后又写 `x as Record<string, unknown>` 才能读字段的，改用 `isPlainObject(x)`：守卫本身就收窄成 Record，断言可整条删掉。',
  verifies: [
    '识别 `as Record<string, unknown>`（含 `<Record<string, unknown>>` 前缀式）断言。',
    '断言目标为标识符或属性路径，且同文件出现过 `isObject(<同一目标>)` 时计一条。',
    '同文件没有 isObject 守卫的 Record 断言不计（那是另一类未收窄问题）。',
  ],
  tags: ['code-style', 'type-guards'],
  defaultSeverity: 'error',
  run({ context, report }) {
    const section = report.section('isObject + Record assertion')

    for (const info of collectCodeStyleFiles(context)) {
      const sourceFile = getCachedSourceFile(context, info)
      const guardedTargets = new Set<string>()
      const assertions: Array<{ target: string; node: ts.Node }> = []

      walk(sourceFile, (node) => {
        if (ts.isCallExpression(node) && isIsObjectCall(node)) {
          const target = referenceTextOf(node.arguments[0])
          if (target) guardedTargets.add(target)
          return
        }
        if (!ts.isAsExpression(node) && !ts.isTypeAssertionExpression(node)) return
        if (!isUnknownRecordType(node.type)) return
        const target = referenceTextOf(node.expression)
        if (target) assertions.push({ target, node })
      })

      for (const assertion of assertions) {
        if (!guardedTargets.has(assertion.target)) continue
        const line = lineOf(sourceFile, assertion.node)
        section.add({
          ruleId: 'is-object-then-record-cast',
          file: info.relativePath,
          line,
          message:
            `${info.relativePath}:${line}: \`${assertion.target}\` 被 isObject 守卫后仍断言成 ` +
            'Record<string, unknown>。守卫改 `isPlainObject`（core 已有）即可直接读字段，' +
            `断言整条删掉：${snippetOf(sourceFile, assertion.node)}`,
          fingerprintInput: `${info.relativePath}::${assertion.target}::is-object-then-record-cast::${line}`,
        })
      }
    }
  },
})

function isIsObjectCall(node: ts.CallExpression): boolean {
  const callee = node.expression
  if (ts.isIdentifier(callee)) return callee.text === 'isObject'
  return ts.isPropertyAccessExpression(callee) && callee.name.text === 'isObject'
}

/** `Record<string, unknown>` 字面类型（不含别名，别名交给 canonical-unknown-json-record 门）。 */
function isUnknownRecordType(typeNode: ts.TypeNode): boolean {
  if (!ts.isTypeReferenceNode(typeNode)) return false
  if (!ts.isIdentifier(typeNode.typeName) || typeNode.typeName.text !== 'Record') return false
  const args = typeNode.typeArguments
  if (args?.length !== 2) return false
  return args[0]?.kind === ts.SyntaxKind.StringKeyword && args[1]?.kind === ts.SyntaxKind.UnknownKeyword
}

/** 标识符或纯属性路径（`a.b.c`）的规范文本；其它表达式返回 null（无法比对守卫目标）。 */
function referenceTextOf(node: ts.Node | undefined): string | null {
  if (!node) return null
  if (ts.isParenthesizedExpression(node)) return referenceTextOf(node.expression)
  if (ts.isIdentifier(node)) return node.text
  if (ts.isThisTypeNode(node) || node.kind === ts.SyntaxKind.ThisKeyword) return 'this'
  if (ts.isPropertyAccessExpression(node)) {
    const head = referenceTextOf(node.expression)
    return head ? `${head}.${node.name.text}` : null
  }
  return null
}

export { preferIsPlainObjectOverGuardedRecordCast }
