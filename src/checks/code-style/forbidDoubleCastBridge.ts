import { defineCheck } from '../../core/defineCheck'
import ts from 'typescript'

import { collectCodeStyleFiles, columnOf, getCachedSourceFile, lineOf, snippetOf, walk } from './_shared'

/**
 * 禁止 `as unknown as X` / `as any as X` 这类双重断言"跳板"（宪章 §12.5「`as unknown as` 全仓禁绝」）。
 *
 * `as` 不是判定堆的药方，是骗编译器：真正需要收敛外来数据时在边界解析一次
 * （zod / ForgivingSchema / 共享守卫），信任区之内信任类型系统。
 *
 * 覆盖两种跳板 inner 类型：
 *   - `x as unknown as X`（`unknown` 跳板）
 *   - `x as any as X`（`any` 跳板，取代仅捕 `as any as` 的旧 opt-in `forbidDoubleAsAny`）
 *
 * 检测走 AST（`ts.AsExpression` 内层还是 `AsExpression` 且其 type 为 `unknown`/`any`），
 * 因此字符串字面量与注释里的 "as unknown as" 不会误报。
 */
const forbidDoubleCastBridge = defineCheck({
  id: 'code-style/forbid-double-cast-bridge',
  title: 'Forbid `as unknown as` / `as any as` double-cast bridges',
  description:
    '禁止 `as unknown as X` / `as any as X` 双重断言跳板（§12.5）；外来数据在边界解析一次，信任区内信任类型系统。',
  verifies: [
    '走 AST 识别外层 `AsExpression` 且内层仍是 `AsExpression`、内层断言目标为 `unknown` 或 `any` 关键字。',
    '字符串/注释中的 "as unknown as" 因走 AST 不会误报。',
  ],
  tags: ['code-style', 'types'],
  defaultSeverity: 'error',
  run({ context, report }) {
    const section = report.section('Double-cast bridges')
    for (const info of collectCodeStyleFiles(context)) {
      const sourceFile = getCachedSourceFile(context, info)
      walk(sourceFile, (node) => {
        if (!ts.isAsExpression(node)) return
        const inner = unwrapInner(node.expression)
        if (!ts.isAsExpression(inner)) return
        const bridge = bridgeKeyword(inner.type)
        if (!bridge) return
        const line = lineOf(sourceFile, node)
        const column = columnOf(sourceFile, node)
        section.add({
          ruleId: 'double-cast-bridge',
          file: info.relativePath,
          line,
          column,
          message: `${info.relativePath}:${line}: \`as ${bridge} as …\` double-cast bridge on "${snippetOf(sourceFile, node)}". §12.5 禁绝——请在边界解析一次（zod / ForgivingSchema / 共享守卫），不要跳板强转。`,
          fingerprintInput: `${info.relativePath}::${line}::${column}::double-cast-${bridge}`,
        })
      })
    }
  },
})

/** 内层可能被括号包裹：`(x as unknown) as Y`。剥括号后再判定。 */
function unwrapInner(expr: ts.Expression): ts.Expression {
  let e = expr
  while (ts.isParenthesizedExpression(e)) {
    e = e.expression
  }
  return e
}

function bridgeKeyword(typeNode: ts.TypeNode): 'unknown' | 'any' | undefined {
  if (typeNode.kind === ts.SyntaxKind.UnknownKeyword) return 'unknown'
  if (typeNode.kind === ts.SyntaxKind.AnyKeyword) return 'any'
  return undefined
}

export { forbidDoubleCastBridge }
