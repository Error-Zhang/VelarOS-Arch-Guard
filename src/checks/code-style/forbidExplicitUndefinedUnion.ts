import { defineCheck } from '../../core/defineCheck'
import ts from 'typescript'

import { collectCodeStyleFiles, columnOf, getCachedSourceFile, lineOf, snippetOf, walk } from './_shared'

/**
 * 缺席值门 · 值位 `T | undefined` 计数棘轮（宪章 §12.6「缺席值单一」）。
 *
 * "值的缺席"只用 `null`（`Nullable<T>`）表达；`undefined` 只保留语言原生语义。
 * 在**值位**手写 `| undefined`（契约字段/返回/别名的值类型）属于把 `undefined` 当值传递。
 *
 * 口径（贴普查「非可选 prop/param 声明位」，得 ~134 而非全量 union）——仅计：
 *   - 直接作为**属性签名 / 类字段 / 参数**类型的 `| undefined` union，且该声明**不带 `?`**。
 * 因此不计：返回类型 / 类型别名 RHS / 泛型实参内嵌 union / 带 `?` 的 optional 语法位 /
 * 局部变量声明（`let x: T | undefined` 原生未赋值边界）——这些属边界或原生 optional 语义。
 *
 * 与 `forbid-nullish-churn` / `forbid-undefined-coalescing` 并列同族。软性计数门（warning）：
 * 存量入 baseline 建立计数基线，看板只降不升；不硬拦以免误伤边界注解，新增在 CI 日志可见。
 */
const forbidExplicitUndefinedUnion = defineCheck({
  id: 'code-style/forbid-explicit-undefined-union',
  title: 'Forbid value-position `T | undefined` unions',
  description:
    '非可选 prop/param 声明位 `T | undefined` 计数棘轮（§12.6）；缺席用 `Nullable<T>`（null），可选用 `?:`。',
  verifies: [
    '走 AST 识别含 `undefined` 成员的 UnionTypeNode。',
    '仅计直接作为非可选属性签名 / 类字段 / 参数类型的 union；返回类型 / 别名 / 内嵌 / optional 语法位 / 局部变量声明不计。',
  ],
  tags: ['code-style', 'nullish-discipline', 'types'],
  defaultSeverity: 'error',
  run({ context, report }) {
    const section = report.section('Undefined value unions')
    for (const info of collectCodeStyleFiles(context)) {
      const sourceFile = getCachedSourceFile(context, info)
      walk(sourceFile, (node) => {
        if (!ts.isUnionTypeNode(node)) return
        if (!node.types.some((member) => member.kind === ts.SyntaxKind.UndefinedKeyword)) return
        if (!isNonOptionalDeclarationPosition(node)) return
        const line = lineOf(sourceFile, node)
        const column = columnOf(sourceFile, node)
        section.add({
          ruleId: 'undefined-value-union',
          file: info.relativePath,
          line,
          column,
          message: `${info.relativePath}:${line}: 值位 \`${snippetOf(sourceFile, node, 60)}\` 手写 \`| undefined\`（§12.6）。可选字段改 \`?:\`，值缺席改 \`Nullable<T>\`（null）。`,
          fingerprintInput: `${info.relativePath}::${line}::${column}::undefined-value-union`,
        })
      })
    }
  },
})

/**
 * 是否为「非可选 prop/param 声明位」——union 直接作为属性签名 / 类字段 / 参数的类型，且不带 `?`。
 * 这是普查 134 的口径：只数声明位携带的 `| undefined`，不数返回类型 / 别名 / 内嵌 / 局部变量。
 */
function isNonOptionalDeclarationPosition(union: ts.UnionTypeNode): boolean {
  const owner = union.parent
  if (
    ts.isPropertySignature(owner) ||
    ts.isPropertyDeclaration(owner) ||
    ts.isParameter(owner)
  ) return owner.type === union && owner.questionToken === undefined
  return false
}

export { forbidExplicitUndefinedUnion }
