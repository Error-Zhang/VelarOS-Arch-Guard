import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

/**
 * 发布面的**机械保证**：从 git 安装本包的消费者拿到的 dist 必须是完整、自洽的。
 *
 * 背景：`dist/` 曾经写在 `.gitignore` 里，同时又有 196 个 dist 文件用 `git add -f` 硬塞进
 * 仓库。这两件事一起成立时，「跟踪的 dist」与「构建出的 dist」会悄悄分叉：新建的模块
 * （比如 `dist/utils/ensureNamedImport.js`）被 ignore 挡住，`git status` 里根本看不见，
 * 一次普通 `git add -A` 提交出的就是一份**残缺**的 tracked dist——里面的 `fixContext.js`
 * import 一个不存在的文件，消费者一 import 整包就崩。实现者知道要 `git add -f`，但那只是
 * 一条口头纪律。这里把它变成门。
 */

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const distDir = join(repositoryRoot, 'dist')

function listFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...listFiles(full))
    else out.push(full)
  }
  return out
}

function git(...args) {
  return spawnSync('git', args, { cwd: repositoryRoot, encoding: 'utf8' })
}

test('nothing the published package needs is hidden from git by .gitignore', () => {
  assert.ok(existsSync(distDir), 'run `npm run build` first')
  if (git('rev-parse', '--is-inside-work-tree').status !== 0) return

  const files = listFiles(distDir).map((file) => relative(repositoryRoot, file))
  const ignored = git('check-ignore', '--', ...files)
  // exit 0 = 至少一个被 ignore；exit 1 = 一个都没有（我们要的）。
  assert.equal(
    ignored.status,
    1,
    'these build outputs are git-ignored, so `git add -A` silently commits an incomplete dist:\n' +
      `${ignored.stdout}\nDrop them from .gitignore (dist/ is a tracked publish surface).`
  )
})

test('every dist file the entry points reach actually exists', () => {
  assert.ok(existsSync(distDir), 'run `npm run build` first')
  const manifest = JSON.parse(readFileSync(join(repositoryRoot, 'package.json'), 'utf8'))

  const entryPoints = new Set()
  const addEntry = (value) => {
    if (typeof value === 'string' && value.startsWith('./dist/')) entryPoints.add(value.slice(2))
  }
  addEntry(manifest.main)
  addEntry(manifest.types)
  for (const target of Object.values(manifest.exports ?? {})) {
    if (typeof target === 'string') addEntry(target)
    else for (const nested of Object.values(target)) addEntry(nested)
  }
  assert.ok(entryPoints.size > 0)

  const missing = []
  const seen = new Set()
  const queue = [...entryPoints]
  while (queue.length > 0) {
    const relativePath = queue.pop()
    if (seen.has(relativePath)) continue
    seen.add(relativePath)
    const absolute = join(repositoryRoot, relativePath)
    if (!existsSync(absolute)) {
      missing.push(relativePath)
      continue
    }
    if (!relativePath.endsWith('.js')) continue
    const source = readFileSync(absolute, 'utf8')
    for (const match of source.matchAll(/from\s+'(\.[^']+)'/g)) {
      const target = relative(repositoryRoot, resolve(dirname(absolute), match[1]))
      queue.push(target)
    }
  }

  assert.deepEqual(missing, [], 'the built package references files that are not there')
})
