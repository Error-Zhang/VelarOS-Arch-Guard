import { defineCheck } from '../../core/defineCheck'
import ts from 'typescript'

import { collectCodeStyleFiles, getCachedSourceFile, lineOf, snippetOf, walk } from './_shared'

const ContractTypeNames = new Set(['Nullish', 'Nullable', 'LooseOptional', 'LooseOption'])

/**
 * 类型层按真实缺席语义使用项目约定的辅助类型。
 *
 * 范围：所有 TS 文件中的 union type node。
 * 例外：定义缺席类型别名本身的位置。
 */
const preferLooseOptional = defineCheck({
  id: 'code-style/prefer-loose-optional',
  title: 'Prefer explicit absence helper types',
  description: '对外契约不要手写 nullish union；用 Nullable<T>、LooseOptional<T> 或 `?` 表达真实缺席语义。',
  verifies: ['在每个 UnionTypeNode 中检测是否手写 nullish 与值类型；豁免 Nullable/LooseOptional/Nullish 的定义本身。'],
  tags: ['code-style', 'type-safety'],
  defaultSeverity: 'error',
  run({ context, report }) {
    const section = report.section('Loose optional type unions')
    for (const info of collectCodeStyleFiles(context, { runtimeOnly: false })) {
      const sourceFile = getCachedSourceFile(context, info)
      walk(sourceFile, (node) => {
        if (isOptionalNullableContract(node)) {
          const line = lineOf(sourceFile, node)
          section.add({
            ruleId: 'optional-nullable-contract',
            file: info.relativePath,
            line,
            message: `${info.relativePath}:${line}: optional Nullable contract "${snippetOf(sourceFile, node)}" allows both null and undefined. Use "LooseOptional<T>" to express that absence explicitly.`,
            fingerprintInput: `${info.relativePath}::${line}::optional-nullable-contract`,
          })
          return
        }

        if (!ts.isUnionTypeNode(node)) return
        if (isDefiningContractType(node)) return
        const parts = flattenUnionParts(node)
        const hasNull = parts.some(isNullTypePart)
        const hasUndefined = parts.some(isUndefinedTypePart)
        const hasNullish = hasNull || hasUndefined
        const hasValue = parts.some((part) => !isNullishTypePart(part))
        if (!hasNullish || !hasValue) return
        if (hasUndefined && !hasNull && !shouldReportUndefinedUnion(node)) return
        const replacement = hasNull && hasUndefined
          ? 'LooseOptional<T>'
          : hasNull
            ? 'Nullable<T>'
            : '?'
        const line = lineOf(sourceFile, node)
        section.add({
          ruleId: 'inline-nullable-union',
          file: info.relativePath,
          line,
          message: `${info.relativePath}:${line}: "${snippetOf(sourceFile, node)}" hand-writes a nullish type union. Use "${replacement}" to express absence explicitly.`,
          fingerprintInput: `${info.relativePath}::${line}::nullable-union`,
        })
      })
    }
  },
})

function isDefiningContractType(node: ts.UnionTypeNode): boolean {
  const parent = node.parent
  return ts.isTypeAliasDeclaration(parent) && ContractTypeNames.has(parent.name.text)
}

function isOptionalNullableContract(node: ts.Node): node is ts.TypeReferenceNode {
  if (!ts.isTypeReferenceNode(node) || node.typeName.getText() !== 'Nullable') return false
  const parent = node.parent
  return (
    (ts.isPropertySignature(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isParameter(parent)) &&
    parent.type === node &&
    Boolean(parent.questionToken)
  )
}

function unwrapTypeNode(node: ts.TypeNode): ts.TypeNode {
  let current: ts.TypeNode = node
  while (ts.isParenthesizedTypeNode(current)) current = current.type
  return current
}

function flattenUnionParts(node: ts.UnionTypeNode): ts.TypeNode[] {
  const result: ts.TypeNode[] = []
  for (const part of node.types) {
    const unwrapped = unwrapTypeNode(part)
    if (ts.isUnionTypeNode(unwrapped)) result.push(...flattenUnionParts(unwrapped))
    else result.push(unwrapped)
  }
  return result
}

function isNullishTypePart(node: ts.TypeNode): boolean {
  return isNullTypePart(node) || isUndefinedTypePart(node)
}

function isNullTypePart(node: ts.TypeNode): boolean {
  const unwrapped = unwrapTypeNode(node)
  return unwrapped.kind === ts.SyntaxKind.NullKeyword ||
    (ts.isLiteralTypeNode(unwrapped) && unwrapped.literal.kind === ts.SyntaxKind.NullKeyword) ||
    (ts.isTypeReferenceNode(unwrapped) && unwrapped.typeName.getText() === 'Nullish')
}

function isUndefinedTypePart(node: ts.TypeNode): boolean {
  const unwrapped = unwrapTypeNode(node)
  return unwrapped.kind === ts.SyntaxKind.UndefinedKeyword ||
    (ts.isTypeReferenceNode(unwrapped) && unwrapped.typeName.getText() === 'Nullish')
}

function shouldReportUndefinedUnion(node: ts.UnionTypeNode): boolean {
  const parent = node.parent
  return ts.isPropertySignature(parent) || ts.isPropertyDeclaration(parent)
}

export { preferLooseOptional }
