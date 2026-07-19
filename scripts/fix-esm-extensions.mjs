#!/usr/bin/env node
import { existsSync,readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname,extname, resolve } from 'node:path'

/**
 * 给 tsc 输出的 .js / .d.ts 文件里的相对 import 加 .js / .d.ts 后缀。
 *
 * tsc 在 module:ESNext + bundler resolution 下不会自动加扩展名，
 * 而 Node 原生 ESM 必须有扩展名才能解析。该脚本扫描 dist/ 并补齐。
 *
 * 用法：
 *   node fix-esm-extensions.mjs              # 修复 cwd/dist
 *   node fix-esm-extensions.mjs path/to/dist # 修复指定目录
 */

const targetArg = process.argv[2]
const DIST_DIR = targetArg ? resolve(process.cwd(), targetArg) : resolve(process.cwd(), 'dist')

if (!existsSync(DIST_DIR)) {
  console.error(`fix-esm-extensions: dist directory not found at ${DIST_DIR}`)
  process.exit(1)
}

let touchedFiles = 0
let touchedImports = 0

walk(DIST_DIR)

console.info(
  `fix-esm-extensions: rewrote ${touchedImports} imports in ${touchedFiles} files under dist/.`
)

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry)
    const stats = statSync(full)
    if (stats.isDirectory()) {
      walk(full)
      continue
    }
    const ext = extname(full)
    if (ext !== '.js' && ext !== '.ts') continue
    fixFile(full)
  }
}

function fixFile(file) {
  const original = readFileSync(file, 'utf-8')
  let updatedImports = 0
  const patched = original.replace(
    /(\bfrom\s+['"]|\bimport\(\s*['"]|\bexport\s+(?:\*|\{[^}]*\}|type\s+\*|type\s+\{[^}]*\})\s+from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g,
    (match, prefix, specifier, suffix) => {
      const rewritten = rewriteSpecifier(file, specifier)
      if (!rewritten) return match
      updatedImports += 1
      return `${prefix}${rewritten}${suffix}`
    }
  )
  if (updatedImports > 0) {
    writeFileSync(file, patched, 'utf-8')
    touchedFiles += 1
    touchedImports += updatedImports
  }
}

function rewriteSpecifier(fromFile, specifier) {
  if (/\.(js|mjs|cjs|json)$/.test(specifier)) return null

  const fromDir = dirname(fromFile)
  const candidateFile = resolve(fromDir, `${specifier}.js`)
  if (existsSync(candidateFile)) return `${specifier}.js`

  const candidateIndex = resolve(fromDir, specifier, 'index.js')
  if (existsSync(candidateIndex)) return `${specifier}/index.js`

  return null
}
