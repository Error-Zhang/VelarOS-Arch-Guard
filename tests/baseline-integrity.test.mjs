import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

/**
 * 变异测试：故意破坏，逐条断言门的反应。
 *
 * 这是「改完之后门没变松」的唯一证明形式——每个用例都对应基线机制的一个已知洞：
 *   ① 指纹不含表达式文本 → 同文件同行同规则的**另一条**违规被静默赦免
 *   ② 只读命令 `run` 默认写盘 → 「报告绿、checkout 基线又红」的假绿
 *   ③ 唯一修复入口 `baseline update` 是全仓重冻 → 把别处的真新债一起冻进来
 *   ⑤ autofix 只改表达式不管 import → TS2304 + TS2322 级联
 * 外加对照组：**行号漂移**目前仍会误红（洞④ 的身份重设计尚未落地，这里把现状钉住）。
 */

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const cli = join(repositoryRoot, 'bin', 'arch-guard.mjs')
const distIndex = pathToFileURL(join(repositoryRoot, 'dist', 'index.js')).href
const distCodeStyle = pathToFileURL(join(repositoryRoot, 'dist', 'checks', 'code-style', 'index.js')).href

function runCli(cwd, ...args) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' })
}

/** 建一个只装两条 code-style 规则的最小仓库。 */
function makeFixture(files, options = {}) {
  // macOS 的 tmpdir 是 /private 的软链；不取 realpath 的话 CLI 解析出的 rootDir 与
  // 收集到的绝对路径前缀对不上，相对路径算错，扫描面直接空掉。
  const rootDir = realpathSync(mkdtempSync(join(tmpdir(), 'arch-guard-integrity-')))
  mkdirSync(join(rootDir, 'src'), { recursive: true })
  for (const [relativePath, content] of Object.entries(files)) {
    mkdirSync(dirname(join(rootDir, relativePath)), { recursive: true })
    writeFileSync(join(rootDir, relativePath), content, 'utf8')
  }
  const helpers = options.helperModule
    ? `helpers: { module: ${JSON.stringify(options.helperModule)} },`
    : ''
  // 不读文件扫描面的 check——docs 索引 / package.json 契约 / i18n / 遗留 .mjs 巨石都是这一形态。
  // 它们无视 `--file` 作用域照报全量违规，正是带作用域的 `baseline update` 会误冻的东西。
  const manifestCheck = options.manifestCheck
    ? `
const manifestCheck = defineCheck({
  id: 'fixture/manifest-contract',
  title: 'Manifest contract',
  description: 'Reads manifest.txt directly, ignoring the file scan surface.',
  verifies: ['Every manifest entry is allowed.'],
  run({ context, report }) {
    const path = nodeJoin(context.rootDir, 'manifest.txt')
    if (!nodeExists(path)) return
    const lines = nodeRead(path, 'utf8').split('\\n').filter(Boolean)
    const section = report.section('Manifest')
    for (let index = 0; index < lines.length; index += 1) {
      section.add({
        ruleId: 'fixture/manifest-contract/line',
        file: 'manifest.txt',
        line: index + 1,
        message: \`manifest.txt:\${index + 1}: forbidden entry "\${lines[index]}".\`,
        fingerprintInput: \`manifest.txt::\${index + 1}::line\`,
      })
    }
  },
})
`
    : ''
  writeFileSync(
    join(rootDir, 'arch-guard.config.mjs'),
    `import { existsSync as nodeExists, readFileSync as nodeRead } from 'node:fs'
import { join as nodeJoin } from 'node:path'

import { defineCheck, defineConfig, definePlugin } from '${distIndex}'
import { codeStyleChecks, createCodeStyleDefaults } from '${distCodeStyle}'
${manifestCheck}
export default defineConfig({
  checks: [${options.manifestCheck ? 'manifestCheck' : ''}],
  plugins: [
    definePlugin({
      name: 'fixture',
      checks: codeStyleChecks,
      defaults: createCodeStyleDefaults({
        scope: { scanRoots: ['src'], runtimeRoots: ['src/'] },
        ${helpers}
      }),
    }),
  ],
  files: { roots: ['src'], extensions: ['.ts'] },
})
`,
    'utf8'
  )
  return rootDir
}

function git(rootDir, ...args) {
  return spawnSync('git', args, { cwd: rootDir, encoding: 'utf8' })
}

const baselineRelativePath = join('.arch-guard', 'baseline.json')

function readBaseline(rootDir) {
  return JSON.parse(readFileSync(join(rootDir, baselineRelativePath), 'utf8'))
}

function writeBaseline(rootDir, payload) {
  mkdirSync(join(rootDir, '.arch-guard'), { recursive: true })
  writeFileSync(join(rootDir, baselineRelativePath), `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

// ——— 洞①：指纹撞车 ———————————————————————————————————————————————

test('① a different expression on the frozen line is NOT silently waived once the entry has a content digest', () => {
  const rootDir = makeFixture({
    'src/a.ts': 'export function probe(alpha: unknown): boolean {\n  return typeof alpha === "string"\n}\n',
  })

  // 冻结现状。
  assert.equal(runCli(rootDir, 'baseline', 'update').status, 0)
  assert.equal(runCli(rootDir, 'verify').status, 0)
  const frozen = readBaseline(rootDir)
  assert.equal(frozen.entries.length, 1)
  assert.ok(frozen.entries[0].contentDigest, 'baseline update must write a content digest')

  // 同一行换成**另一条**违规：同 file、同 line、同 ruleId → fingerprint 完全相同。
  writeFileSync(
    join(rootDir, 'src/a.ts'),
    'export function probe(beta: unknown): boolean {\n  return typeof beta === "string"\n}\n',
    'utf8'
  )
  const after = runCli(rootDir, 'verify')
  assert.equal(after.status, 1, `expected the impostor to fail the gate:\n${after.stdout}`)
})

test('① the same collision IS silently waived on a legacy entry without a digest — that is the hole migrate closes', () => {
  const rootDir = makeFixture({
    'src/a.ts': 'export function probe(alpha: unknown): boolean {\n  return typeof alpha === "string"\n}\n',
  })
  assert.equal(runCli(rootDir, 'baseline', 'update').status, 0)

  // 退回 0.2.x 形态的条目（无 contentDigest）。
  const legacy = readBaseline(rootDir)
  for (const entry of legacy.entries) delete entry.contentDigest
  writeBaseline(rootDir, legacy)

  writeFileSync(
    join(rootDir, 'src/a.ts'),
    'export function probe(beta: unknown): boolean {\n  return typeof beta === "string"\n}\n',
    'utf8'
  )
  assert.equal(runCli(rootDir, 'verify').status, 0, 'legacy behaviour: the impostor slips through')

  // migrate 把冻结时的内容钉进去，同一条冒名违规立刻变红。
  const migrated = runCli(rootDir, 'baseline', 'migrate')
  assert.equal(migrated.status, 0, migrated.stderr)
  assert.match(migrated.stdout, /freeze code that no longer exists/)
  assert.equal(runCli(rootDir, 'verify').status, 1)
})

test('① migrate digests EVERY entry, including the ones this run cannot match', () => {
  const rootDir = makeFixture({
    'src/a.ts': 'export function probe(alpha: unknown): boolean {\n  return typeof alpha === "string"\n}\n',
  })
  writeBaseline(rootDir, {
    version: 1,
    entries: [
      {
        checkId: 'code-style/forbid-raw-runtime-type-guards',
        ruleId: 'code-style/forbid-raw-runtime-type-guards/typeof-string',
        fingerprint: 'deadbeefdeadbeef',
        message: 'src/gone.ts:1: "typeof gone === \\"string\\"" — use isString(gone).',
        file: 'src/gone.ts',
      },
    ],
  })
  const migrated = runCli(rootDir, 'baseline', 'migrate')
  assert.equal(migrated.status, 0, migrated.stderr)
  assert.match(migrated.stdout, /1 computed offline from the frozen message/)
  const after = readBaseline(rootDir)
  assert.equal(after.entries.length, 1)
  assert.ok(
    after.entries[0].contentDigest,
    'an unmatched entry keeps waiving its whole (file,line,rule) slot until it carries a digest'
  )
})

test('① the blank cheque a stale legacy entry hands out is closed by migrate', () => {
  // 迁移时匹配不到 ≠ 无害：那条 (文件, 行, 规则) 槽位仍然通配，以后落在同一行的**任何**
  // 违规都会被它赦免。旧实现恰好跳过这些条目——用来关洞①的迁移，把洞①留在最危险的槽位上。
  const rootDir = makeFixture({
    'src/a.ts': 'export function probe(alpha: unknown): boolean {\n  return typeof alpha === "string"\n}\n',
  })
  assert.equal(runCli(rootDir, 'baseline', 'update').status, 0)
  const frozen = readBaseline(rootDir)
  for (const entry of frozen.entries) delete entry.contentDigest // 退回 0.2.x 形态
  writeBaseline(rootDir, frozen)

  // 违规先消失（条目变成 stale），此刻迁移。
  writeFileSync(join(rootDir, 'src/a.ts'), 'export const answer = 42\n', 'utf8')
  assert.equal(runCli(rootDir, 'baseline', 'migrate').status, 0)

  // 后来同一行上冒出**另一条**违规：指纹完全相同。
  writeFileSync(
    join(rootDir, 'src/a.ts'),
    'export function probe(beta: unknown): boolean {\n  return typeof beta === "string"\n}\n',
    'utf8'
  )
  const after = runCli(rootDir, 'verify')
  assert.equal(after.status, 1, `the stale slot must not waive a violation it never saw:\n${after.stdout}`)
})

test('① migrate --dry-run reports the real number of violations that lose their waiver', () => {
  // 旧计数只在「该指纹下没有任何现存违规匹配冻结摘要」时记一条；指纹下有 N 条而其中一条
  // 对上时，另外 N−1 条迁移后会失豁免变红，却既不计数也不列出（真实基线上低报约 20 倍）。
  const rootDir = makeFixture({
    'src/a.ts':
      'export function probe(alpha: unknown, beta: unknown): boolean {\n' +
      '  return typeof alpha === "string" || typeof beta === "string"\n' +
      '}\n',
  })
  assert.equal(runCli(rootDir, 'baseline', 'update').status, 0)
  const frozen = readBaseline(rootDir)
  assert.equal(frozen.entries.length, 2)
  // 退回 0.2.x：同一指纹只留一条无摘要的条目——它今天靠通配盖住了两条违规。
  const [first] = frozen.entries
  delete first.contentDigest
  writeBaseline(rootDir, { version: 1, entries: [first] })
  assert.equal(runCli(rootDir, 'verify').status, 0, 'the legacy entry waives both today')

  const dry = runCli(rootDir, 'baseline', 'migrate', '--dry-run')
  assert.equal(dry.status, 0, dry.stderr)
  assert.match(dry.stdout, /1 violation waived today will STOP being waived/)
  assert.equal(readBaseline(rootDir).entries.length, 1, '--dry-run must not write')

  assert.equal(runCli(rootDir, 'baseline', 'migrate').status, 0)
  assert.equal(runCli(rootDir, 'verify').status, 1, 'and the prediction must come true')
})

test('① one frozen occurrence does not waive three copies of the same code', () => {
  // `isWaived` 是 Map 查表、不计数：一条冻结记录可以无限次命中。内容摘要解决不了这个——
  // 三份逐字相同的表达式摘要也相同。身份必须是 (指纹, 摘要, 配额)。
  const rootDir = makeFixture({
    'src/a.ts': 'export function probe(alpha: unknown): boolean {\n  return typeof alpha === "string"\n}\n',
  })
  assert.equal(runCli(rootDir, 'baseline', 'update').status, 0)
  assert.equal(runCli(rootDir, 'verify').status, 0)

  writeFileSync(
    join(rootDir, 'src/a.ts'),
    'export function probe(alpha: unknown): boolean {\n' +
      '  return typeof alpha === "string" || typeof alpha === "string" || typeof alpha === "string"\n' +
      '}\n',
    'utf8'
  )
  const tripled = runCli(rootDir, 'verify')
  assert.equal(tripled.status, 1, `two extra copies must fail the gate:\n${tripled.stdout}`)
  assert.match(tripled.stdout, /beyond the frozen occurrence count/)

  // 重冻之后又必须幂等：三份都冻上（count: 3），verify 立刻回绿。
  assert.equal(runCli(rootDir, 'baseline', 'update').status, 0)
  const frozen = readBaseline(rootDir)
  assert.equal(frozen.entries.length, 1, 'one waiver key = one entry')
  assert.equal(frozen.entries[0].count, 3)
  assert.equal(runCli(rootDir, 'verify').status, 0, 'a full re-freeze must leave the gate green')

  // 第四份仍然红。
  writeFileSync(
    join(rootDir, 'src/a.ts'),
    'export function probe(alpha: unknown): boolean {\n' +
      '  return typeof alpha === "string" || typeof alpha === "string" || typeof alpha === "string" || typeof alpha === "string"\n' +
      '}\n',
    'utf8'
  )
  assert.equal(runCli(rootDir, 'verify').status, 1)
})

test('① two distinct violations that share one fingerprint are both freezable — update stays idempotent', () => {
  // `file::line::kind` 的 fingerprintInput 区分不出同一行上的两条违规；如果基线按指纹去重，
  // 全仓重冻之后第二条会立刻判红，`baseline update` 就不再幂等。按 (指纹, 内容) 存才对。
  const rootDir = makeFixture({
    'src/a.ts':
      'export function probe(alpha: unknown, beta: unknown): boolean {\n' +
      '  return typeof alpha === "string" || typeof beta === "string"\n' +
      '}\n',
  })
  assert.equal(runCli(rootDir, 'baseline', 'update').status, 0)
  const frozen = readBaseline(rootDir)
  assert.equal(frozen.entries.length, 2, 'both same-line violations must be recorded')
  assert.equal(
    new Set(frozen.entries.map((entry) => entry.fingerprint)).size,
    1,
    'they really do share one fingerprint'
  )
  assert.equal(runCli(rootDir, 'verify').status, 0, 'a full re-freeze must leave the gate green')

  // 第三条同形态违规仍然要红。
  writeFileSync(
    join(rootDir, 'src/a.ts'),
    'export function probe(alpha: unknown, beta: unknown, gamma: unknown): boolean {\n' +
      '  return typeof alpha === "string" || typeof beta === "string" || typeof gamma === "string"\n' +
      '}\n',
    'utf8'
  )
  assert.equal(runCli(rootDir, 'verify').status, 1)
})

// ——— 洞②：只读命令写盘 ————————————————————————————————————————————

test('② run and verify never write the baseline, even with stale entries', () => {
  const rootDir = makeFixture({
    'src/a.ts': 'export function probe(alpha: unknown): boolean {\n  return typeof alpha === "string"\n}\n',
  })
  assert.equal(runCli(rootDir, 'baseline', 'update').status, 0)

  // 把违规修掉：基线里那条立刻 stale——0.2.x 的 `run` 会当场删掉并回写。
  writeFileSync(join(rootDir, 'src/a.ts'), 'export const answer = 42\n', 'utf8')
  const baselinePath = join(rootDir, baselineRelativePath)
  const before = readFileSync(baselinePath, 'utf8')
  const beforeMtime = statSync(baselinePath).mtimeMs

  const ran = runCli(rootDir, 'run')
  assert.equal(ran.status, 0)
  assert.equal(runCli(rootDir, 'verify').status, 0)
  assert.equal(runCli(rootDir, 'run', '--fix').status, 0)

  assert.equal(readFileSync(baselinePath, 'utf8'), before, 'run/verify must not rewrite the baseline')
  assert.equal(statSync(baselinePath).mtimeMs, beforeMtime, 'the baseline file must not be touched at all')
})

test('② --fail-on-stale turns "already fixed but still frozen" into a failure instead of a silent rewrite', () => {
  const rootDir = makeFixture({
    'src/a.ts': 'export function probe(alpha: unknown): boolean {\n  return typeof alpha === "string"\n}\n',
  })
  assert.equal(runCli(rootDir, 'baseline', 'update').status, 0)
  writeFileSync(join(rootDir, 'src/a.ts'), 'export const answer = 42\n', 'utf8')

  assert.equal(runCli(rootDir, 'verify').status, 0)
  const strict = runCli(rootDir, 'verify', '--fail-on-stale')
  assert.equal(strict.status, 1)
  assert.match(strict.stdout, /stale/)
})

test('② baseline prune is the one command that retires stale entries, and it refuses under a scope', () => {
  const rootDir = makeFixture({
    'src/a.ts': 'export function probe(alpha: unknown): boolean {\n  return typeof alpha === "string"\n}\n',
    'src/b.ts': 'export function other(beta: unknown): boolean {\n  return typeof beta === "number"\n}\n',
  })
  assert.equal(runCli(rootDir, 'baseline', 'update').status, 0)
  assert.equal(readBaseline(rootDir).entries.length, 2)

  writeFileSync(join(rootDir, 'src/a.ts'), 'export const answer = 42\n', 'utf8')

  const scoped = runCli(rootDir, 'baseline', 'prune', '--file', 'src/a.ts')
  assert.equal(scoped.status, 2)
  assert.match(scoped.stderr, /refuses to run under/)
  assert.equal(readBaseline(rootDir).entries.length, 2)

  const dry = runCli(rootDir, 'baseline', 'prune', '--dry-run')
  assert.equal(dry.status, 0, dry.stderr)
  assert.equal(readBaseline(rootDir).entries.length, 2, '--dry-run must not write')

  const pruned = runCli(rootDir, 'baseline', 'prune')
  assert.equal(pruned.status, 0, pruned.stderr)
  const after = readBaseline(rootDir)
  assert.equal(after.entries.length, 1)
  assert.equal(after.entries[0].file, 'src/b.ts')
})

test('② baseline prune refuses to wipe everything when the run matched nothing', () => {
  const rootDir = makeFixture({ 'src/a.ts': 'export const answer = 42\n' })
  writeBaseline(rootDir, {
    version: 1,
    entries: [
      {
        checkId: 'code-style/forbid-raw-runtime-type-guards',
        ruleId: 'code-style/forbid-raw-runtime-type-guards/typeof-string',
        fingerprint: 'deadbeefdeadbeef',
        message: 'src/gone.ts:1: gone.',
        file: 'src/gone.ts',
      },
    ],
  })
  const refused = runCli(rootDir, 'baseline', 'prune')
  assert.equal(refused.status, 2)
  assert.match(refused.stderr, /refusing to prune all/)
  assert.equal(readBaseline(rootDir).entries.length, 1)

  const forced = runCli(rootDir, 'baseline', 'prune', '--force')
  assert.equal(forced.status, 0, forced.stderr)
  assert.equal(readBaseline(rootDir).entries.length, 0)
})

// ——— 洞③：全仓重冻是钝器 ————————————————————————————————————————

test('③ a scoped baseline update retires only what the scope fixed and refuses to freeze new debt elsewhere', () => {
  const rootDir = makeFixture({
    'src/a.ts': 'export function probe(alpha: unknown): boolean {\n  return typeof alpha === "string"\n}\n',
    'src/b.ts': 'export function other(beta: unknown): boolean {\n  return typeof beta === "number"\n}\n',
  })
  assert.equal(runCli(rootDir, 'baseline', 'update').status, 0)
  assert.equal(readBaseline(rootDir).entries.length, 2)

  // 我修好了 a.ts；与此同时并行实例在 c.ts 里制造了一条真新债。
  writeFileSync(join(rootDir, 'src/a.ts'), 'export const answer = 42\n', 'utf8')
  writeFileSync(
    join(rootDir, 'src/c.ts'),
    'export function third(gamma: unknown): boolean {\n  return typeof gamma === "boolean"\n}\n',
    'utf8'
  )

  const scoped = runCli(rootDir, 'baseline', 'update', '--file', 'src/a.ts')
  assert.equal(scoped.status, 0, scoped.stderr)
  const after = readBaseline(rootDir)
  assert.deepEqual(
    after.entries.map((entry) => entry.file).sort(),
    ['src/b.ts'],
    'a.ts retired, b.ts preserved, c.ts must NOT be frozen'
  )
  // c.ts 的新债还红着——这正是钝器版本会静默吃掉的东西。
  assert.equal(runCli(rootDir, 'verify').status, 1)
})

test('③ a scoped update does NOT freeze violations reported outside the file scan surface', () => {
  // 收窄扫描面 ≠ 收窄违规列表。`observed` 是本次运行的**全量**违规，只过滤 `existing`
  // 等于把域外新债一起冻住——用治洞③的药重新打开洞③，还会写出重复条目。
  const rootDir = makeFixture(
    {
      'src/a.ts': 'export function probe(alpha: unknown): boolean {\n  return typeof alpha === "string"\n}\n',
      'manifest.txt': 'legacy-entry\n',
    },
    { manifestCheck: true }
  )
  assert.equal(runCli(rootDir, 'baseline', 'update').status, 0)
  const frozen = readBaseline(rootDir)
  assert.equal(frozen.entries.length, 2, 'one code-style entry + one manifest entry')

  // 我修好了 src/a.ts；与此同时并行实例往 manifest.txt 加了一条真新债。
  writeFileSync(join(rootDir, 'src/a.ts'), 'export const answer = 42\n', 'utf8')
  writeFileSync(join(rootDir, 'manifest.txt'), 'legacy-entry\nbrand-new-entry\n', 'utf8')

  const scoped = runCli(rootDir, 'baseline', 'update', '--file', 'src/a.ts')
  assert.equal(scoped.status, 0, scoped.stderr)

  const after = readBaseline(rootDir)
  assert.deepEqual(
    after.entries.map((entry) => `${entry.file}:${entry.message}`),
    frozen.entries
      .filter((entry) => entry.file === 'manifest.txt')
      .map((entry) => `${entry.file}:${entry.message}`),
    'only the pre-existing manifest entry survives — nothing new frozen, nothing duplicated'
  )
  const manifestEntries = after.entries.filter((entry) => entry.file === 'manifest.txt')
  assert.equal(manifestEntries.length, 1, 'the preserved entry must not be duplicated')
  assert.deepEqual(
    manifestEntries[0],
    frozen.entries.find((entry) => entry.file === 'manifest.txt'),
    'out-of-scope entries are preserved byte-for-byte'
  )
  assert.match(scoped.stdout, /fall outside the scope and were\s+NOT frozen/)
  assert.equal(runCli(rootDir, 'verify').status, 1, 'the new manifest debt still fails the gate')
})

test('① --changed with no scannable file is a no-op, NOT a whole-repository re-freeze', () => {
  // `--changed` 的 diff 里没有 .ts/.tsx/.js/.mjs 时旧实现回落成 active:false ＝ 无作用域分支
  // ＝ 全仓重冻，还打印「下次用 --changed 限定作用域」——用户刚刚传的就是 --changed。
  const rootDir = makeFixture({
    'src/a.ts': 'export function probe(alpha: unknown): boolean {\n  return typeof alpha === "string"\n}\n',
  })
  assert.equal(git(rootDir, 'init', '-q').status, 0)
  git(rootDir, 'config', 'user.email', 'test@example.com')
  git(rootDir, 'config', 'user.name', 'test')
  assert.equal(runCli(rootDir, 'baseline', 'update').status, 0)
  git(rootDir, 'add', '-A')
  git(rootDir, 'commit', '-qm', 'seed')

  // 并行实例把一条真新债提交进来了；我这边只动了一个 .md。
  writeFileSync(
    join(rootDir, 'src/c.ts'),
    'export function third(gamma: unknown): boolean {\n  return typeof gamma === "boolean"\n}\n',
    'utf8'
  )
  git(rootDir, 'add', 'src/c.ts')
  git(rootDir, 'commit', '-qm', 'someone else')
  writeFileSync(join(rootDir, 'notes.md'), '# notes\n', 'utf8')

  const baselinePath = join(rootDir, baselineRelativePath)
  const before = readFileSync(baselinePath, 'utf8')
  const beforeMtime = statSync(baselinePath).mtimeMs

  const changed = runCli(rootDir, 'baseline', 'update', '--changed')
  assert.equal(changed.status, 0, changed.stderr)
  assert.match(changed.stdout, /resolved to 0 scannable files/)
  assert.equal(readFileSync(baselinePath, 'utf8'), before, 'the baseline must not be rewritten')
  assert.equal(statSync(baselinePath).mtimeMs, beforeMtime, 'the baseline file must not be touched')
  assert.equal(runCli(rootDir, 'verify').status, 1, 'and the unrelated new debt is still red')
})

test('① --staged with no scannable file scans nothing instead of the whole repository', () => {
  const rootDir = makeFixture({
    'src/a.ts': 'export function probe(alpha: unknown): boolean {\n  return typeof alpha === "string"\n}\n',
  })
  assert.equal(git(rootDir, 'init', '-q').status, 0)
  git(rootDir, 'config', 'user.email', 'test@example.com')
  git(rootDir, 'config', 'user.name', 'test')
  writeFileSync(join(rootDir, 'notes.md'), '# notes\n', 'utf8')
  git(rootDir, 'add', 'notes.md')

  // 没有基线，src/a.ts 是裸露的违规：全仓跑会红。--staged 只暂存了 .md，应当什么都不扫。
  assert.equal(runCli(rootDir, 'verify', '--no-baseline').status, 1)
  const staged = runCli(rootDir, 'verify', '--no-baseline', '--staged')
  assert.equal(staged.status, 0, `--staged must not silently widen to the repository:\n${staged.stdout}`)
})

test('③ an unscoped baseline update still freezes everything, but now says so loudly', () => {
  const rootDir = makeFixture({
    'src/a.ts': 'export function probe(alpha: unknown): boolean {\n  return typeof alpha === "string"\n}\n',
  })
  assert.equal(runCli(rootDir, 'baseline', 'update').status, 0)
  writeFileSync(
    join(rootDir, 'src/c.ts'),
    'export function third(gamma: unknown): boolean {\n  return typeof gamma === "boolean"\n}\n',
    'utf8'
  )

  const dry = runCli(rootDir, 'baseline', 'update', '--dry-run')
  assert.equal(dry.status, 0, dry.stderr)
  assert.match(dry.stdout, /\+1 new/)
  assert.match(dry.stdout, /an unscoped update also freezes debt you did not write/)
  assert.equal(readBaseline(rootDir).entries.length, 1, '--dry-run must not write')

  assert.equal(runCli(rootDir, 'baseline', 'update').status, 0)
  assert.equal(readBaseline(rootDir).entries.length, 2)
})

// ——— 写盘面：不带明确写意图的命令一律不碰基线字节 ————————————————

test('② a bare `baseline` prints usage and writes nothing — no implicit default action', () => {
  const rootDir = makeFixture({
    'src/a.ts': 'export function probe(alpha: unknown): boolean {\n  return typeof alpha === "string"\n}\n',
  })
  assert.equal(runCli(rootDir, 'baseline', 'update').status, 0)
  writeFileSync(
    join(rootDir, 'src/c.ts'),
    'export function third(gamma: unknown): boolean {\n  return typeof gamma === "boolean"\n}\n',
    'utf8'
  )
  const baselinePath = join(rootDir, baselineRelativePath)
  const before = readFileSync(baselinePath, 'utf8')
  const beforeMtime = statSync(baselinePath).mtimeMs

  const bare = runCli(rootDir, 'baseline')
  assert.equal(bare.status, 2)
  assert.match(bare.stderr, /Usage: arch-guard baseline <update\|prune\|migrate\|check>/)
  assert.equal(readFileSync(baselinePath, 'utf8'), before)
  assert.equal(statSync(baselinePath).mtimeMs, beforeMtime)
})

test('② baseline check answers the question it advertises, and never writes', () => {
  // 旧实现带 `ignoreBaseline: true` 跑再对「有没有违规」判失败：基线 100% 覆盖时照样报
  // 「有未覆盖的违规」，exit 0 只在零违规的仓里可达＝一个恒假的红。
  const rootDir = makeFixture({
    'src/a.ts': 'export function probe(alpha: unknown): boolean {\n  return typeof alpha === "string"\n}\n',
  })
  assert.equal(runCli(rootDir, 'baseline', 'update').status, 0)
  const baselinePath = join(rootDir, baselineRelativePath)
  const before = readFileSync(baselinePath, 'utf8')
  const beforeMtime = statSync(baselinePath).mtimeMs

  const covered = runCli(rootDir, 'baseline', 'check')
  assert.equal(covered.status, 0, `full coverage must be green:\n${covered.stdout}${covered.stderr}`)
  assert.match(covered.stdout, /covers every violation/)

  writeFileSync(
    join(rootDir, 'src/c.ts'),
    'export function third(gamma: unknown): boolean {\n  return typeof gamma === "boolean"\n}\n',
    'utf8'
  )
  const uncovered = runCli(rootDir, 'baseline', 'check')
  assert.equal(uncovered.status, 1)
  assert.match(uncovered.stderr, /1 violation not covered/)

  assert.equal(readFileSync(baselinePath, 'utf8'), before, 'baseline check must never write')
  assert.equal(statSync(baselinePath).mtimeMs, beforeMtime)
})

// ——— 洞⑥：判定带副作用，多趟运行自己打自己 ————————————————————————

test('⑥ --fix runs several passes; the first pass must not spend the waiver quota', () => {
  // `isWaived` 曾经在查询时就扣配额，而 runner 只建一个 Baseline 实例、在 --fix 的多趟循环里
  // 反复复用。于是第一趟之后配额见底，本来被豁免的存量违规在后续趟里全变红：
  // `run --fix` 判红、`verify` 对同一棵树判绿。Desktop 的 check:architecture:fix 正走这条路。
  const rootDir = makeFixture(
    {
      'src/a.ts': 'export function probe(alpha: unknown): boolean {\n  return typeof alpha === "string"\n}\n',
      'manifest.txt': 'legacy-entry\n',
    },
    { manifestCheck: true, helperModule: '@velaros-ai/core' }
  )
  assert.equal(runCli(rootDir, 'baseline', 'update').status, 0)
  assert.equal(runCli(rootDir, 'verify').status, 0)

  // 一条**没被冻**的可自动修复违规：它是让 --fix 至少跑第二趟的唯一条件
  //（被豁免的违规已经从 aggregate 里滤掉了，不会成为修复候选）。
  writeFileSync(
    join(rootDir, 'src/b.ts'),
    'export function other(beta: unknown): boolean {\n  return typeof beta === "number"\n}\n',
    'utf8'
  )

  const fixed = runCli(rootDir, 'run', '--fix')
  assert.equal(
    fixed.status,
    0,
    `frozen debt must stay waived on every pass, not just the first:\n${fixed.stdout}${fixed.stderr}`
  )
  assert.doesNotMatch(
    fixed.stdout + fixed.stderr,
    /exceed the number of/,
    'a re-query is not a second occurrence'
  )
  // 同一棵树，两条命令必须给同一个答案。
  assert.equal(runCli(rootDir, 'verify').status, 0)
})

test('⑥ the quota itself still bites: a real extra occurrence fails even under --fix', () => {
  // 对照组：拆掉「跨趟串味」不等于把配额拆了。
  const rootDir = makeFixture(
    {
      'src/a.ts': 'export function probe(alpha: unknown): boolean {\n  return typeof alpha === "string"\n}\n',
      'manifest.txt': 'legacy-entry\n',
    },
    { manifestCheck: true, helperModule: '@velaros-ai/core' }
  )
  assert.equal(runCli(rootDir, 'baseline', 'update').status, 0)
  writeFileSync(join(rootDir, 'manifest.txt'), 'legacy-entry\nlegacy-entry\n', 'utf8')
  writeFileSync(
    join(rootDir, 'src/b.ts'),
    'export function other(beta: unknown): boolean {\n  return typeof beta === "number"\n}\n',
    'utf8'
  )
  assert.equal(
    runCli(rootDir, 'run', '--fix').status,
    1,
    'a genuinely duplicated violation is still new debt'
  )
})

// ——— 洞⑦：「用户给了参数」≠「作用域收窄了」 ————————————————————————

test('⑦ `baseline update --skip X` is a whole-repository re-freeze and must stop calling itself scoped', () => {
  // --skip X 让**其余每一条 check** 都落在「作用域内」，于是它是不折不扣的全仓重冻，
  // 却打印安抚性的 (scoped) 并吞掉「这次也冻了你没写的债」那句警告。
  const rootDir = makeFixture(
    {
      'src/a.ts': 'export function probe(alpha: unknown): boolean {\n  return typeof alpha === "string"\n}\n',
      'manifest.txt': 'legacy-entry\n',
    },
    { manifestCheck: true }
  )
  assert.equal(runCli(rootDir, 'baseline', 'update').status, 0)
  // 并行实例制造了一条真新债。
  writeFileSync(
    join(rootDir, 'src/c.ts'),
    'export function third(gamma: unknown): boolean {\n  return typeof gamma === "boolean"\n}\n',
    'utf8'
  )

  const skipped = runCli(
    rootDir, 'baseline', 'update', '--skip', 'fixture/manifest-contract', '--dry-run'
  )
  assert.equal(skipped.status, 0, skipped.stderr)
  assert.doesNotMatch(skipped.stdout, /\(scoped\)/, '--skip narrows nothing; do not call it scoped')
  assert.match(skipped.stdout, /whole repository, minus --skip fixture\/manifest-contract/)
  assert.match(
    skipped.stdout,
    /an unscoped update also freezes debt you did not write/,
    'the loud warning is exactly what the mislabel used to suppress'
  )

  // 点名式的过滤器仍然算收窄——它答得出「小在哪」。
  const only = runCli(
    rootDir, 'baseline', 'update', '--only', 'fixture/manifest-contract', '--dry-run'
  )
  assert.equal(only.status, 0, only.stderr)
  assert.match(only.stdout, /scoped to --only fixture\/manifest-contract/)
  assert.doesNotMatch(only.stdout, /an unscoped update also freezes/)
})

test('⑦ --skip still preserves the skipped check entries — merge semantics are untouched', () => {
  // 「不算收窄」只改标签与警告；域外条目照旧原样保留，否则 --skip 会把 X 的条目当 stale 删掉。
  const rootDir = makeFixture(
    {
      'src/a.ts': 'export function probe(alpha: unknown): boolean {\n  return typeof alpha === "string"\n}\n',
      'manifest.txt': 'legacy-entry\n',
    },
    { manifestCheck: true }
  )
  assert.equal(runCli(rootDir, 'baseline', 'update').status, 0)
  const before = readBaseline(rootDir).entries.find(
    (entry) => entry.checkId === 'fixture/manifest-contract'
  )
  assert.ok(before)

  assert.equal(runCli(rootDir, 'baseline', 'update', '--skip', 'fixture/manifest-contract').status, 0)
  const after = readBaseline(rootDir).entries.filter(
    (entry) => entry.checkId === 'fixture/manifest-contract'
  )
  assert.equal(after.length, 1, 'the skipped check keeps exactly its one entry')
  assert.deepEqual(after[0], before, 'byte-for-byte preserved')
})

// ——— 洞⑧：「扫了零个文件」不许长得像「扫完了没问题」 ————————————————

test('⑧ read-only commands say out loud when the file scope resolved to nothing', () => {
  const rootDir = makeFixture(
    {
      'src/a.ts': 'export function probe(alpha: unknown): boolean {\n  return typeof alpha === "string"\n}\n',
      'manifest.txt': 'legacy-entry\n',
    },
    { manifestCheck: true }
  )
  assert.equal(git(rootDir, 'init', '-q').status, 0)
  git(rootDir, 'config', 'user.email', 'test@example.com')
  git(rootDir, 'config', 'user.name', 'test')
  assert.equal(runCli(rootDir, 'baseline', 'update').status, 0)
  git(rootDir, 'add', '-A')
  git(rootDir, 'commit', '-qm', 'seed')
  writeFileSync(join(rootDir, 'notes.md'), '# notes\n', 'utf8')

  const checked = runCli(rootDir, 'baseline', 'check', '--changed')
  assert.equal(checked.status, 0, checked.stderr)
  assert.match(checked.stdout, /resolved to 0 scannable files/)
  assert.doesNotMatch(checked.stdout, /covers every violation/, 'covering nothing is not coverage')

  const verified = runCli(rootDir, 'verify', '--changed')
  assert.equal(verified.status, 0)
  assert.match(verified.stdout, /PASS/)
  assert.match(verified.stdout, /no file was scanned/, 'a bare PASS here reads as "the code is fine"')

  const asJson = runCli(rootDir, 'verify', '--changed', '--json')
  assert.equal(asJson.status, 0)
  assert.ok(JSON.parse(asJson.stdout).emptyFileScope, 'machine consumers need the same distinction')

  const ran = runCli(rootDir, 'run', '--changed')
  assert.equal(ran.status, 0)
  assert.match(ran.stderr, /no file was scanned/)
})

test('⑧ the empty-scope notice goes to stderr, so --format json stays parseable', () => {
  // 自查抓到的自伤：`run --format json` 不带 `--out` 时把报告写进 stdout。
  // 往那条流里插一行人话，产物就 JSON.parse 不过了。诊断归 stderr，报告归 stdout。
  const rootDir = makeFixture(
    { 'src/a.ts': 'export const answer = 42\n', 'manifest.txt': 'legacy-entry\n' },
    { manifestCheck: true }
  )
  assert.equal(git(rootDir, 'init', '-q').status, 0)
  git(rootDir, 'config', 'user.email', 'test@example.com')
  git(rootDir, 'config', 'user.name', 'test')
  git(rootDir, 'add', '-A')
  git(rootDir, 'commit', '-qm', 'seed')
  writeFileSync(join(rootDir, 'notes.md'), '# notes\n', 'utf8')

  const ran = runCli(rootDir, 'run', '--changed', '--no-baseline', '--format', 'json')
  assert.doesNotThrow(
    () => JSON.parse(ran.stdout),
    `stdout must stay machine-readable:\n${ran.stdout.slice(-300)}`
  )
  assert.match(ran.stderr, /no file was scanned/, 'and the notice must still be emitted')
})

test('⑧ an empty file scope is a notice, not a short-circuit — repo-wide checks still fail the gate', () => {
  // 短路才是真正的「门变松」：不读文件扫描面的 check（docs 索引、package.json 契约）
  // 与 --changed 无关，跳过它们等于让一个只改 .md 的 PR 绕过整类规则。
  const rootDir = makeFixture(
    { 'src/a.ts': 'export const answer = 42\n', 'manifest.txt': 'legacy-entry\n' },
    { manifestCheck: true }
  )
  assert.equal(git(rootDir, 'init', '-q').status, 0)
  git(rootDir, 'config', 'user.email', 'test@example.com')
  git(rootDir, 'config', 'user.name', 'test')
  writeFileSync(join(rootDir, 'notes.md'), '# notes\n', 'utf8')
  git(rootDir, 'add', 'notes.md')

  const staged = runCli(rootDir, 'verify', '--no-baseline', '--staged')
  assert.equal(staged.status, 1, 'the manifest debt ignores the file scope and must still be red')
  assert.match(staged.stdout, /no file was scanned/)

  // `baseline check` 的告示分支不许抢在「有没有覆盖不住的违规」前面返回 0。
  const checked = runCli(rootDir, 'baseline', 'check', '--staged')
  assert.equal(checked.status, 1, 'uncovered repo-wide debt must still fail baseline check')
  assert.match(checked.stderr, /1 violation not covered/)

  const ran = runCli(rootDir, 'run', '--no-baseline', '--staged')
  assert.equal(ran.status, 1, 'and run must still exit 1')
})

// ——— 洞⑨：作用域谓词把同一条违规既保留又重冻 ————————————————————

test('⑨ an entry without `file` is not blindly kept while the same violation is re-frozen', () => {
  // entry.file === undefined → 旧谓词判「域外」→ 原样保留；而同一条违规**带** file 被观察到、
  // 判了域内、于是又冻一遍。同一条债在基线里出现两次。
  const rootDir = makeFixture({
    'src/a.ts': 'export function probe(alpha: unknown): boolean {\n  return typeof alpha === "string"\n}\n',
  })
  assert.equal(runCli(rootDir, 'baseline', 'update').status, 0)
  const frozen = readBaseline(rootDir)
  assert.equal(frozen.entries.length, 1)

  // 退回到「这条 check 当时还不填 file」的形态——指纹一模一样。
  const fileless = { ...frozen.entries[0] }
  delete fileless.file
  writeBaseline(rootDir, { version: 1, entries: [fileless] })

  const scoped = runCli(rootDir, 'baseline', 'update', '--file', 'src/a.ts')
  assert.equal(scoped.status, 0, scoped.stderr)
  const after = readBaseline(rootDir)
  assert.equal(
    after.entries.length,
    1,
    `one violation must not end up frozen twice:\n${JSON.stringify(after, null, 2)}`
  )
  assert.equal(runCli(rootDir, 'verify').status, 0)
})

test('⑨ --file src/a.ts matches an entry whose path was written as ./src/a.ts', () => {
  const rootDir = makeFixture({
    'src/a.ts': 'export function probe(alpha: unknown): boolean {\n  return typeof alpha === "string"\n}\n',
  })
  assert.equal(runCli(rootDir, 'baseline', 'update').status, 0)
  const frozen = readBaseline(rootDir)
  writeBaseline(rootDir, { version: 1, entries: [{ ...frozen.entries[0], file: './src/a.ts' }] })

  assert.equal(runCli(rootDir, 'baseline', 'update', '--file', 'src/a.ts').status, 0)
  const after = readBaseline(rootDir)
  assert.equal(
    after.entries.length,
    1,
    `a different spelling of the same path must not double-freeze:\n${JSON.stringify(after, null, 2)}`
  )
})

// ——— 对照组：仍然会红的东西 ————————————————————————————————————

test('control: a brand-new violation in an untouched file still fails the gate', () => {
  const rootDir = makeFixture({
    'src/a.ts': 'export function probe(alpha: unknown): boolean {\n  return typeof alpha === "string"\n}\n',
  })
  assert.equal(runCli(rootDir, 'baseline', 'update').status, 0)
  assert.equal(runCli(rootDir, 'verify').status, 0)
  writeFileSync(
    join(rootDir, 'src/new.ts'),
    'export function fresh(delta: unknown): boolean {\n  return typeof delta === "boolean"\n}\n',
    'utf8'
  )
  assert.equal(runCli(rootDir, 'verify').status, 1)
})

test('control: a second violation added to a frozen file still fails the gate', () => {
  const rootDir = makeFixture({
    'src/a.ts': 'export function probe(alpha: unknown): boolean {\n  return typeof alpha === "string"\n}\n',
  })
  assert.equal(runCli(rootDir, 'baseline', 'update').status, 0)
  writeFileSync(
    join(rootDir, 'src/a.ts'),
    'export function probe(alpha: unknown): boolean {\n  return typeof alpha === "string"\n}\n' +
      'export function twin(beta: unknown): boolean {\n  return typeof beta === "string"\n}\n',
    'utf8'
  )
  assert.equal(runCli(rootDir, 'verify').status, 1)
})

test('known gap (hole ④): line drift still reds — identity is line-based until the count ratchet lands', () => {
  const rootDir = makeFixture({
    'src/a.ts': 'export function probe(alpha: unknown): boolean {\n  return typeof alpha === "string"\n}\n',
  })
  assert.equal(runCli(rootDir, 'baseline', 'update').status, 0)
  assert.equal(runCli(rootDir, 'verify').status, 0)

  // 只在上面加一行注释，违规本身一个字没动。
  writeFileSync(
    join(rootDir, 'src/a.ts'),
    '// 顶部新增一行\nexport function probe(alpha: unknown): boolean {\n  return typeof alpha === "string"\n}\n',
    'utf8'
  )
  assert.equal(
    runCli(rootDir, 'verify').status,
    1,
    'documented gap: the fingerprint carries the line number, so drift is a false red'
  )
})
