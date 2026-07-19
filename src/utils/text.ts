import { createHash } from 'node:crypto'

/** 把任意字符转义后嵌入 RegExp 字面量。 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 格式化一份"前 N 个 + 省略提示"的列表展示，便于 stylish reporter 输出。 */
function formatShortList(items: readonly string[], limit = 30): string {
  const visibleItems = items.slice(0, limit)
  const suffix = items.length > limit ? `\n  ... and ${items.length - limit} more` : ''
  return `${visibleItems.map((item) => `\n  - ${item}`).join('')}${suffix}`
}

/** kebab-case 转 PascalCase。 */
function kebabToPascalCase(value: string): string {
  return value
    .split('-')
    .filter(Boolean)
    .map((segment) => `${segment[0]?.toUpperCase() ?? ''}${segment.slice(1)}`)
    .join('')
}

/** 短 hash，常用于 fingerprint 提取关键内容指纹。 */
function shortHash(value: string, length = 12): string {
  return createHash('sha1').update(value).digest('hex').slice(0, length)
}

/** 去掉源码中所有行注释 (`// ...`) 和块注释 (`/* ... *\/`)，保留代码结构。 */
function stripCodeComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/**
 * 按 1-based 行号删除一整行（用于机械删行类 autofix）。
 * 尽量保留末尾换行；换行风格统一为 `\n`（与多数格式化工具一致）。
 */
function deleteLineAt(source: string, lineOneBased: number): string {
  const hadTrailing = source.endsWith('\n')
  const lines = source.split(/\r?\n/)
  if (lineOneBased < 1 || lineOneBased > lines.length) return source
  lines.splice(lineOneBased - 1, 1)
  const body = lines.join('\n')
  if (lines.length === 0) return hadTrailing ? '\n' : ''
  return hadTrailing ? `${body}\n` : body
}

export {
  deleteLineAt,
  escapeRegExp,
  formatShortList,
  kebabToPascalCase,
  shortHash,
  stripCodeComments,
}
