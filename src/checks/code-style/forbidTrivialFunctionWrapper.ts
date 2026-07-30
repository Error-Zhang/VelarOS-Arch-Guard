import { defineCheck } from '../../core/defineCheck'
import type { CheckReportSection } from '../../core/report'
import ts from 'typescript'

import { collectCodeStyleFiles, getCachedSourceFile, lineOf, walk } from './_shared'

/**
 * 禁止「仅把参数按序透传给另一函数」的无意义具名封装（`function f(a){return g(a)}`）。
 * 请改为在调用方直接使用目标函数，或使用 `export { g as f } from` 等再导出（不产生多余栈帧）。
 *
 * 覆盖面（宪章 §12.5「无域语义的一行转发函数禁止」）：
 *   - export / default 的 `function` 声明。
 *   - **任意** `const x = (…) => impl(…)` / `const x = function(…){ return impl(…) }`——
 *     不再局限于 export 顶层，local const 箭头转发同样计入（普查盲区）。
 * async / 解构参数 / rest / 走向 import 值或方法调用的边界薄封装保守跳过。
 */
const forbidTrivialFunctionWrapper = defineCheck({
  id: 'code-style/forbid-trivial-function-wrapper',
  title: 'Forbid trivial one-line forwarder functions',
  description:
    '禁止仅透传参数的一行转发函数（export function 与任意 const 箭头转发）；直接调用底层实现或 `export { x as y } from`。async / 解构参数 / rest 保守跳过。',
  verifies: [
    '扫描 export 的 function 与任意 `const x = () => …`（含 local）；体为单 return 调用或箭头表达式直接调用。',
    '仅当实参与形参个数相同且第 i 个实参为与第 i 个形参同名的 Identifier 时报告。',
  ],
  tags: ['code-style', 'readability'],
  defaultSeverity: 'warning',
  run({ context, report }) {
    const section = report.section('Trivial function forward')
    for (const info of collectCodeStyleFiles(context)) {
      const sourceFile = getCachedSourceFile(context, info)
      const importedValueNames = collectImportedValueNames(sourceFile)
      walk(sourceFile, (node) => {
        if (ts.isFunctionDeclaration(node) && node.name && node.body) {
          const mods = ts.getCombinedModifierFlags(node)
          if (mods & (ts.ModifierFlags.Export | ts.ModifierFlags.Default)) {
            reportIfTrivialForwarder(
              section,
              info.relativePath,
              sourceFile,
              node,
              node.name.text,
              importedValueNames
            )
          }
          return
        }
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
          if (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) {
            reportIfTrivialForwarder(
              section,
              info.relativePath,
              sourceFile,
              node.initializer,
              node.name.text,
              importedValueNames
            )
          }
          return
        }
        if (ts.isExportAssignment(node) && !node.isExportEquals && node.expression) {
          const expr = node.expression
          if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) {
            reportIfTrivialForwarder(
              section,
              info.relativePath,
              sourceFile,
              expr,
              'default',
              importedValueNames
            )
          }
        }
      })
    }
  },
})

function functionLikeIsAsync(fn: ts.FunctionLikeDeclaration): boolean {
  const mod = fn.modifiers
  return mod?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false
}

function reportIfTrivialForwarder(
  section: CheckReportSection,
  relativePath: string,
  sourceFile: ts.SourceFile,
  fn: ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration,
  declaredName: string,
  importedValueNames: ReadonlySet<string>
): void {
  if (functionLikeIsAsync(fn)) return
  const body = fn.body
  if (!body) return

  const paramNames = collectSimpleBindingParamNames(fn.parameters)
  if (paramNames === undefined) return

  const call = extractSingleCallFromBody(body)
  if (!call) return
  if (isBoundaryAliasCall(call, importedValueNames)) return

  if (!argsMatchParamsInOrder(call.arguments, paramNames)) return

  const calleeText = call.expression.getText(sourceFile)
  const line = lineOf(sourceFile, fn)
  section.add({
    ruleId: 'trivial-forwarder',
    file: relativePath,
    line,
    message: `${relativePath}:${line}: 无意义透传封装 "${declaredName}(…) → ${calleeText}(…)"。改为直接调用 ${calleeText} 或使用 export 再导出。`,
    fingerprintInput: `${relativePath}::${line}::${declaredName}::${calleeText}`,
    suggestion: `删除 ${declaredName}，从定义 ${calleeText} 的模块 import；或 \`export { ${calleeText} as ${declaredName} } from '…'\`（若需稳定对外名称）。`,
  })
}

function collectImportedValueNames(sourceFile: ts.SourceFile): ReadonlySet<string> {
  const names = new Set<string>()
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause
      if (!clause || clause.isTypeOnly) continue
      if (clause.name) names.add(clause.name.text)
      const bindings = clause.namedBindings
      if (!bindings) continue
      if (ts.isNamespaceImport(bindings)) {
        names.add(bindings.name.text)
        continue
      }
      for (const element of bindings.elements) {
        if (!element.isTypeOnly) names.add(element.name.text)
      }
    } else if (ts.isImportEqualsDeclaration(statement) && !statement.isTypeOnly) {
      names.add(statement.name.text)
    }
  }
  return names
}

function isBoundaryAliasCall(
  call: ts.CallExpression,
  importedValueNames: ReadonlySet<string>
): boolean {
  if (ts.isPropertyAccessExpression(call.expression)) return true
  const root = rootIdentifier(call.expression)
  return !!root && importedValueNames.has(root.text)
}

function rootIdentifier(expression: ts.Expression): ts.Identifier | undefined {
  if (ts.isIdentifier(expression)) return expression
  if (ts.isPropertyAccessExpression(expression)) return rootIdentifier(expression.expression)
  return undefined
}

function collectSimpleBindingParamNames(parameters: readonly ts.ParameterDeclaration[]): string[] | undefined {
  const out: string[] = []
  for (const p of parameters) {
    if (p.dotDotDotToken) return undefined
    if (!ts.isIdentifier(p.name)) return undefined
    if (p.name.text === 'this') continue
    out.push(p.name.text)
  }
  return out
}

function extractSingleCallFromBody(body: ts.ConciseBody): ts.CallExpression | undefined {
  if (ts.isBlock(body)) {
    if (body.statements.length !== 1) return undefined
    const st0 = body.statements[0]!
    if (!ts.isReturnStatement(st0) || !st0.expression) return undefined
    return ts.isCallExpression(st0.expression) ? st0.expression : undefined
  }
  return ts.isCallExpression(body) ? body : undefined
}

function argsMatchParamsInOrder(
  args: readonly ts.Expression[],
  paramNames: readonly string[]
): boolean {
  if (args.length !== paramNames.length) return false
  for (let i = 0; i < paramNames.length; i++) {
    const arg = args[i]!
    if (!ts.isIdentifier(arg) || arg.text !== paramNames[i]) return false
  }
  return true
}

export { forbidTrivialFunctionWrapper }
