import { existsSync, readdirSync, statSync } from 'node:fs'
import { extname, resolve } from 'node:path'

/** 递归收集某目录下指定后缀的所有文件。目录不存在时返回空数组。 */
function collectFiles(dir: string, allowedExtensions: ReadonlySet<string>): string[] {
  if (!existsSync(dir)) return []
  const files: string[] = []
  walkInto(dir, allowedExtensions, files)
  return files
}

function walkInto(dir: string, allowedExtensions: ReadonlySet<string>, out: string[]): void {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const entry of entries) {
    const fullPath = resolve(dir, entry)
    let stats
    try {
      stats = statSync(fullPath)
    } catch {
      continue
    }
    if (stats.isDirectory()) {
      walkInto(fullPath, allowedExtensions, out)
      continue
    }
    if (allowedExtensions.has(extname(fullPath))) {
      out.push(fullPath)
    }
  }
}

/** 寻找项目根目录：向上找含 `package.json` 的目录，未找到时抛错。 */
function findProjectRoot(startDir: string): string {
  let current = startDir
  while (true) {
    if (existsSync(resolve(current, 'package.json'))) return current
    const parent = resolve(current, '..')
    if (parent === current) {
      throw new Error(`arch-guard: unable to locate project root from ${startDir}`)
    }
    current = parent
  }
}

export { collectFiles, findProjectRoot }
