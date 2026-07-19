import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

/**
 * 原子写入：通过 `<path>.tmp` 中转 + `rename` 让读到的状态总是"前一个完整版本"或"新版本"，
 * 永远不会读到半写的文件。
 *
 * 该 helper 由 arch-guard 自己维护，避免反向依赖任何宿主项目；
 * 同样的 contract 在 core 那边也有一份，行为一致。
 *
 * 注意：`tmpSuffix` 默认 `.tmp`；目录会被自动 `mkdirSync({ recursive: true })`。
 */
function writeFileAtomically(filePath: string, content: string, tmpSuffix = '.tmp'): void {
  mkdirSync(dirname(filePath), { recursive: true })
  const tmpPath = resolve(`${filePath}${tmpSuffix}`)
  writeFileSync(tmpPath, content, 'utf-8')
  renameSync(tmpPath, filePath)
}

export { writeFileAtomically }
