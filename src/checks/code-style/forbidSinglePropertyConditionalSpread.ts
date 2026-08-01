import { defineCheck } from '../../core/defineCheck'
import type { FixContext } from '../../core/fixContext'
import ts from 'typescript'

import { fixReplaceSpan, type HelperImportSources, readHelperImportSources } from './_fix'
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
 * 禁止单属性条件对象展开。
 *
 * `...(x ? { x } : {})` 看起来“函数式”，但对单个可选字段可读性很差。
 * 业务对象需要可选字段时统一写 `field: toOptional(value)`，带条件时写
 * `field: optionalWhen(isX, value)`；普通条件不自动修复，避免把 callback
 * truthiness 改成 `optionalWhen(callback, value)`。
 */
const forbidSinglePropertyConditionalSpread = defineCheck({
  id: 'code-style/forbid-single-property-conditional-spread',
  title: 'Forbid single-property conditional object spread',
  description:
    '单个可选字段不要写成条件对象 spread；使用全局 toOptional(value) 表达 `?? undefined` 语义。',
  verifies: [
    '识别对象字面量中的 `...(cond ? { oneField } : {})`。',
    '可自动修复 self 条件与 TypeGuards self 条件，避免把对象解构规则机械化。',
  ],
  tags: ['code-style', 'object-assembly'],
  defaultSeverity: 'error',
  run({ context, report }) {
    const section = report.section('Single-property conditional object spread')
    const helpers = readHelperImportSources(context)
    for (const info of collectCodeStyleFiles(context)) {
      const sourceFile = getCachedSourceFile(context, info)
      walk(sourceFile, (node) => {
        const match = readSinglePropertyConditionalSpread(node, sourceFile)
        if (!match) return

        const line = lineOf(sourceFile, node)
        section.add({
          ruleId: 'prefer-to-optional-field',
          file: info.relativePath,
          line,
          message: `${info.relativePath}:${line}: "${snippetOf(sourceFile, node)}" 是单属性条件对象展开。请写成 \`${match.replacement}\`，需要整组对象合并时才使用 spread。`,
          fingerprintInput: `${info.relativePath}::${line}::single-property-conditional-spread::${match.propertyName}`,
          fixPhase: CodeStyleFixPhase.preferToOptionalOverConditionalSpread,
          fixStartOffset: node.getStart(sourceFile),
          applyFix: fixReplaceText(info.relativePath, sourceFile, node, match.replacement, helpers),
        })
      })
    }
  },
})

function readSinglePropertyConditionalSpread(
  node: ts.Node,
  sourceFile: ts.SourceFile
): { propertyName: string; replacement: string } | undefined {
  if (!ts.isSpreadAssignment(node)) return undefined
  const expression = unwrapParensExpression(node.expression)
  if (!ts.isConditionalExpression(expression)) return undefined

  const whenTrue = readObjectLiteralShape(expression.whenTrue)
  const whenFalse = readObjectLiteralShape(expression.whenFalse)
  if (whenTrue?.kind === 'single' && whenFalse?.kind === 'empty') return buildReplacement(sourceFile, expression.condition, whenTrue.property, false)
  if (whenFalse?.kind === 'single' && whenTrue?.kind === 'empty') return buildReplacement(sourceFile, expression.condition, whenFalse.property, true)
  return undefined
}

const NonNullishGuardNames = new Set([
  'isPresent',
  'isBoolean',
  'isTrue',
  'isFalse',
  'isString',
  'isNonBlankString',
  'isNumber',
  'isPositiveNumber',
  'isFiniteNumber',
  'isFunction',
  'isBigInt',
  'isSymbol',
  'isObject',
  'isRecord',
  'isPlainObject',
  'isArray',
  'isNonEmptyArray',
])

function buildReplacement(
  sourceFile: ts.SourceFile,
  condition: ts.Expression,
  property: ts.ObjectLiteralElementLike,
  invertCondition: boolean
): { propertyName: string; replacement: string } | undefined {
  const propertyName = readPropertyName(property, sourceFile)
  const value = readPropertyValue(property, sourceFile)
  const conditionText = condition.getText(sourceFile)
  if (!invertCondition && conditionText === value) return {
      propertyName,
      replacement: `${propertyName}: toOptional(${value})`,
    }

  const guardSelf = invertCondition ? undefined : readNonNullishGuardSelf(condition, value, sourceFile)
  if (!guardSelf) return undefined

  return {
    propertyName,
    replacement: `${propertyName}: optionalWhen(${guardSelf.guardName}, ${guardSelf.value})`,
  }
}

function readNonNullishGuardSelf(
  condition: ts.Expression,
  value: string,
  sourceFile: ts.SourceFile
): { guardName: string; value: string } | undefined {
  const call = unwrapParensExpression(condition)
  if (!ts.isCallExpression(call)) return undefined
  const callee = unwrapParensExpression(call.expression)
  if (!ts.isIdentifier(callee) || !NonNullishGuardNames.has(callee.text)) return undefined
  if (call.arguments.length !== 1) return undefined

  const guardArg = call.arguments[0]
  if (!guardArg) return undefined
  const candidate = unwrapParensExpression(guardArg).getText(sourceFile)
  if (candidate !== value) return undefined

  return { guardName: callee.text, value }
}

function readObjectLiteralShape(
  expression: ts.Expression
): { kind: 'empty' } | { kind: 'single'; property: ts.ObjectLiteralElementLike } | undefined {
  const unwrapped = unwrapParensExpression(expression)
  if (!ts.isObjectLiteralExpression(unwrapped)) return undefined
  if (unwrapped.properties.length === 0) return { kind: 'empty' }
  if (unwrapped.properties.length !== 1) return undefined

  const property = unwrapped.properties[0]
  if (!property) return undefined
  if (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) return { kind: 'single', property }
  return undefined
}

function readPropertyName(property: ts.ObjectLiteralElementLike, sourceFile: ts.SourceFile): string {
  if (ts.isShorthandPropertyAssignment(property)) return property.name.getText(sourceFile)
  if (ts.isPropertyAssignment(property)) return property.name.getText(sourceFile)
  return 'field'
}

function readPropertyValue(property: ts.ObjectLiteralElementLike, sourceFile: ts.SourceFile): string {
  if (ts.isShorthandPropertyAssignment(property)) return property.name.getText(sourceFile)
  if (ts.isPropertyAssignment(property)) return property.initializer.getText(sourceFile)
  return 'undefined'
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

export { forbidSinglePropertyConditionalSpread }
