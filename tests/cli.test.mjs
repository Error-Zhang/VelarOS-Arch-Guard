import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const cli = join(repositoryRoot, 'bin', 'arch-guard.mjs')

function runCli(cwd, ...args) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' })
}

test('init creates a runnable config and refuses to overwrite it', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'arch-guard-init-'))
  const first = runCli(rootDir, 'init')
  assert.equal(first.status, 0, first.stderr)
  assert.equal(existsSync(join(rootDir, 'arch-guard.config.mjs')), true)
  assert.match(readFileSync(join(rootDir, 'arch-guard.config.mjs'), 'utf8'), /defineConfig/)

  const second = runCli(rootDir, 'init')
  assert.equal(second.status, 1)
  assert.match(second.stderr, /refusing to overwrite/)
})

test('help documents the supported workflow', () => {
  const result = runCli(repositoryRoot, 'help')
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /init\s+Create a safe starter/)
  assert.match(result.stdout, /baseline update\|check/)
  assert.match(result.stdout, /--changed/)
})
