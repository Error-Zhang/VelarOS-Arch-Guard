import { defineCheck } from '../../core/defineCheck'
import ts from 'typescript'

import { collectCodeStyleFiles, getCachedSourceFile, lineOf, walk } from './_shared'

const SameNameFieldThreshold = 8
const DataCarrierSourcePattern =
  /^(?:input|args|config|options|payload|record|row|data|request|response|event\.payload)$/
const DataBoundaryFilePatterns: readonly RegExp[] = [
  /\.d\.ts$/,
  /\.generated\./,
  /\/generated\//,
  /\/i18n\/messages\//,
  /\/test\//,
  /\/tests\//,
  /\/__tests__\//,
  /\/fixtures?\//,
  /\/mocks?\//,
  /contract/i,
  /schema/i,
  /normalizer/i,
  /mapper/i,
  /adapter/i,
  /repository/i,
  /rows/i,
  /ipc/i,
]

/**
 * 检测对象字面量里"把 src.a 复制到 a、把 src.b 复制到 b、..."这种逐字段抄写，超过阈值即报告：
 * 业务代码不该手工搬运结构化数据；要么用 `{ ...src, ...overrides }`，要么把映射移到 mapper/normalizer。
 *
 * 豁免：mapper / adapter / normalizer / schema / contract / ipc 等"本来就是做映射"的文件。
 */
const forbidFieldRemap = defineCheck({
  id: 'code-style/forbid-field-remap',
  title: 'Forbid manual same-name field remapping',
  description: '逐字段把 src.a→a 抄写超过 8 个时报告；用 spread 或把映射移到 mapper 文件。',
  verifies: [
    '识别 ObjectLiteral 中 `{ a: src.a, b: src.b, ... }` 形态；同源 8 字段以上即触发。',
    '出现 spread 的 ObjectLiteral 跳过（已经在用 spread 了）。',
  ],
  tags: ['code-style', 'data-flow'],
  defaultSeverity: 'error',
  run({ context, report }) {
    const section = report.section('Manual field remapping')
    for (const info of collectCodeStyleFiles(context)) {
      if (DataBoundaryFilePatterns.some((pattern) => pattern.test(info.relativePath))) continue
      const sourceFile = getCachedSourceFile(context, info)
      walk(sourceFile, (node) => {
        if (!ts.isObjectLiteralExpression(node)) return
        if (node.properties.some((p) => ts.isSpreadAssignment(p))) return

        const sourceGroups = new Map<string, string[]>()
        for (const property of node.properties) {
          const assignment = readSameNameAssignment(sourceFile, property)
          if (!assignment) continue
          const list = sourceGroups.get(assignment.sourceText) ?? []
          list.push(assignment.propertyName)
          sourceGroups.set(assignment.sourceText, list)
        }

        for (const [sourceText, propertyNames] of sourceGroups) {
          if (!DataCarrierSourcePattern.test(sourceText)) continue
          if (propertyNames.length < SameNameFieldThreshold) continue
          const line = lineOf(sourceFile, node)
          section.add({
            ruleId: 'manual-field-remap',
            file: info.relativePath,
            line,
            message: `${info.relativePath}:${line}: ${propertyNames.length} same-name fields are copied from ${sourceText}. Prefer object spread plus explicit overrides, or move boundary mapping into a mapper/normalizer file. Fields: ${propertyNames.join(', ')}.`,
            fingerprintInput: `${info.relativePath}::${line}::${sourceText}::${propertyNames.slice().sort().join(',')}`,
          })
        }
      })
    }
  },
})

function readSameNameAssignment(
  sourceFile: ts.SourceFile,
  property: ts.ObjectLiteralElementLike
): { propertyName: string; sourceText: string } | undefined {
  if (!ts.isPropertyAssignment(property)) return undefined
  const name = readPropertyName(property.name)
  if (!name) return undefined
  if (!ts.isPropertyAccessExpression(property.initializer)) return undefined
  if (property.initializer.name.text !== name) return undefined
  return {
    propertyName: name,
    sourceText: property.initializer.expression.getText(sourceFile),
  }
}

function readPropertyName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text
  return undefined
}

export { forbidFieldRemap }
