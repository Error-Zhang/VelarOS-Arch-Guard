import type { FileCollections, SharedCache } from './context'
import type { ArchGuardLogger } from './logger'
import type { CheckReport } from './report'
import type { SeverityLevel } from './severity'

/**
 * 检查执行环境。
 *
 * Runner 在调度 check 时构造，并把当前 rootDir、规则配置、文件清单等注入。
 * 具体内容由 core/context.ts 提供。
 */
interface CheckRunContext {
  /** 项目根目录，所有相对路径都以此为基准。 */
  readonly rootDir: string
  /** 当前 check 在配置中的 options（plugin 注入 + 用户 config 覆盖后的结果）。 */
  readonly options: Readonly<Record<string, unknown>>
  /** 共享文件收集器，按 glob/扩展名缓存。 */
  readonly files: FileCollections
  /** 共享缓存器，按 mtime 失效的源文件和 AST 缓存。 */
  readonly cache: SharedCache
  /** 简单日志通道。 */
  readonly log: ArchGuardLogger
}

/** Check 执行函数签名。 */
type CheckRunner = (input: { context: CheckRunContext; report: CheckReport }) => void | Promise<void>

/**
 * 检查项定义。
 *
 * - `id` 必须全局唯一，CLI/config/baseline 都按 id 索引。
 * - `tags` 用于按桶过滤执行（如 imports / styles / docs）。
 * - `appliesTo` 用于声明 check 关心哪些文件 glob，引擎据此预过滤。
 * - `defaultSeverity` 是初始严重级别，可被 user config 的 `rules[id]` 覆盖。
 */
interface Check {
  id: string
  title: string
  description: string
  verifies: readonly string[]
  tags?: readonly string[]
  defaultSeverity?: SeverityLevel
  appliesTo?: CheckAppliesTo
  run: CheckRunner
}

interface CheckAppliesTo {
  include?: readonly string[]
  exclude?: readonly string[]
}

interface CheckInput {
  id: string
  title: string
  description: string
  verifies: readonly string[]
  tags?: readonly string[]
  defaultSeverity?: SeverityLevel
  appliesTo?: CheckAppliesTo
  run: CheckRunner
}

/** 工厂：创建并冻结一个 Check 定义，并做基本校验。 */
function defineCheck(input: CheckInput): Check {
  if (!input.id || typeof input.id !== 'string') {
    throw new Error('arch-guard: defineCheck requires a non-empty string id.')
  }
  if (!input.title || !input.description) {
    throw new Error(`arch-guard: check ${input.id} must define title and description.`)
  }
  if (!Array.isArray(input.verifies) || input.verifies.length === 0) {
    throw new Error(`arch-guard: check ${input.id} must describe what it verifies.`)
  }
  if (typeof input.run !== 'function') {
    throw new Error(`arch-guard: check ${input.id} must provide a run function.`)
  }
  return Object.freeze({
    ...input,
    defaultSeverity: input.defaultSeverity ?? 'error',
  })
}

/** 类型守卫：判断一个对象是否是合法的 Check 定义。 */
function isCheck(value: unknown): value is Check {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Check).id === 'string' &&
    typeof (value as Check).run === 'function'
  )
}

export { defineCheck, isCheck }
export type { Check, CheckAppliesTo, CheckInput, CheckRunContext, CheckRunner }
