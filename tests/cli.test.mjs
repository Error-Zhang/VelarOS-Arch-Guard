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

test('a mistyped --dry-run is rejected, not silently ignored', () => {
  // parseArgs 收下任何 `--foo` 并原样丢进 options；没人读的 key 就此消失。而 --dry-run 是
  // 撤回写意图的唯一机制——一个拼写错误就能让它失效，命令照常写盘，且什么都不报。
  const rootDir = mkdtempSync(join(tmpdir(), 'arch-guard-argv-'))
  const typo = runCli(rootDir, 'baseline', 'update', '--dryrun')
  assert.equal(typo.status, 2, `${typo.stdout}${typo.stderr}`)
  assert.match(typo.stderr, /unknown option `--dryrun`\. Did you mean `--dry-run`\?/)
  assert.equal(existsSync(join(rootDir, '.arch-guard', 'baseline.json')), false)

  const unrelated = runCli(rootDir, 'run', '--totally-made-up')
  assert.equal(unrelated.status, 2)
  assert.match(unrelated.stderr, /unknown option `--totally-made-up`\./)
  assert.doesNotMatch(unrelated.stderr, /Did you mean/)
})

test('every flag the consumers actually pass is still accepted', () => {
  // 这张表就是 KnownOptions 的验收面：漏一个，消费仓的脚本第二天就 exit 2。
  const rootDir = mkdtempSync(join(tmpdir(), 'arch-guard-argv-ok-'))
  for (const args of [
    ['run', '--no-prune-stale-baseline'],
    ['run', '--changed', '--no-prune-stale-baseline'],
    ['run', '--fix', '--no-prune-stale-baseline', '--log-level', 'info'],
    ['run', '--changed', '--no-baseline'],
    ['run', '--file', 'src', '--format', 'json', '--out', 'report.json'],
    ['run', '--no-fix', '--no-warn-stale-baseline', '--baseline-path', '.arch-guard/b.json'],
    ['verify', '--json'],
    ['verify', '--fail-on-stale', '--tag', 'code-style'],
    ['verify', '--changed', '--base', 'HEAD'],
    ['list', '--by-tag'],
    ['list', '--ids-only'],
    ['baseline', 'update', '--dry-run', '--only', 'nothing/here'],
    ['baseline', 'prune', '--force', '--dry-run'],
    ['baseline', 'migrate', '--adopt-live-message', '--dry-run'],
    ['baseline', 'check', '--staged'],
  ]) {
    // 这里只判「选项被认识」这一关（后面因为 tmpdir 里没有可解析的配置而失败是另一回事）。
    const result = runCli(rootDir, ...args)
    assert.doesNotMatch(
      result.stderr,
      /unknown option/,
      `\`arch-guard ${args.join(' ')}\` must not be rejected:\n${result.stderr}`
    )
  }
})

test('help documents the supported workflow', () => {
  const result = runCli(repositoryRoot, 'help')
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /init\s+Create a safe starter/)
  assert.match(result.stdout, /baseline update\s+Re-freeze violations/)
  assert.match(result.stdout, /baseline prune\s+Retire baseline entries/)
  assert.match(result.stdout, /--changed/)
  assert.match(result.stdout, /Read-only commands never write the baseline/)
  assert.match(result.stdout, /`--skip` does not narrow the scope/)
  assert.match(result.stdout, /Unknown long options are rejected/)
})
