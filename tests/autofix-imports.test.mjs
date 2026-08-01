import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

/**
 * 洞⑤ 的变异测试：`--fix` 改写表达式后，被引入的原语必须有 import。
 *
 * 0.2.x 的修复管线只有 `fixReplaceText` / `fixReplaceRange` 两种纯字节切片替换，全程没有
 * import 管理这一步。于是把 `typeof x === 'string'` 修成 `isString(x)` 之后，文件里并没有
 * `isString` 这个名字，`TS2304` 叠加 `TS2322`（未解析标识符不携带类型谓词 → 窄化塌掉），
 * 报错数比缺失的 import 数还多。
 */

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const cli = join(repositoryRoot, 'bin', 'arch-guard.mjs')
const distIndex = pathToFileURL(join(repositoryRoot, 'dist', 'index.js')).href
const distCodeStyle = pathToFileURL(join(repositoryRoot, 'dist', 'checks', 'code-style', 'index.js')).href

function runCli(cwd, ...args) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' })
}

function makeFixture(files, options = {}) {
  const rootDir = realpathSync(mkdtempSync(join(tmpdir(), 'arch-guard-imports-')))
  mkdirSync(join(rootDir, 'src'), { recursive: true })
  for (const [relativePath, content] of Object.entries(files)) {
    mkdirSync(dirname(join(rootDir, relativePath)), { recursive: true })
    writeFileSync(join(rootDir, relativePath), content, 'utf8')
  }
  const helperOptions = {
    ...(options.helperModule ? { module: options.helperModule } : {}),
    ...(options.assumeGlobals ? { assumeGlobals: true } : {}),
  }
  const helpers =
    Object.keys(helperOptions).length > 0 ? `helpers: ${JSON.stringify(helperOptions)},` : ''
  writeFileSync(
    join(rootDir, 'arch-guard.config.mjs'),
    `import { defineConfig, definePlugin } from '${distIndex}'
import { codeStyleChecks, createCodeStyleDefaults } from '${distCodeStyle}'

export default defineConfig({
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

function read(rootDir, relativePath) {
  return readFileSync(join(rootDir, relativePath), 'utf8')
}

test('⑤ --fix adds the named import for every primitive it introduces', () => {
  const rootDir = makeFixture(
    {
      'src/a.ts': 'export function probe(alpha: unknown): boolean {\n  return typeof alpha === "string"\n}\n',
    },
    { helperModule: '@velaros-ai/core' }
  )
  const fixed = runCli(rootDir, 'run', '--fix', '--no-baseline')
  assert.equal(fixed.status, 0, fixed.stdout + fixed.stderr)
  const source = read(rootDir, 'src/a.ts')
  assert.match(source, /isString\(alpha\)/)
  assert.match(source, /^import \{ isString \} from '@velaros-ai\/core'$/m)
})

test('⑤ without a configured module the repair is DECLINED and said out loud — nothing is written', () => {
  // 「没配来源就不补 import」曾被当成向后兼容；实际后果是两个消费仓都没配、`--fix` 一次
  // 引入几百个未解析标识符、且什么都不打印。静默写出不编译的代码是最坏的一档。
  const before =
    'export function probe(alpha: unknown): boolean {\n  return typeof alpha === "string"\n}\n'
  const rootDir = makeFixture({ 'src/a.ts': before })
  const fixed = runCli(rootDir, 'run', '--fix', '--no-baseline')
  assert.equal(read(rootDir, 'src/a.ts'), before, 'the file must be byte-identical')
  assert.match(
    fixed.stdout + fixed.stderr,
    /declined 1 autofix/,
    `expected a loud refusal, got:\n${fixed.stdout}${fixed.stderr}`
  )
  assert.match(fixed.stdout + fixed.stderr, /helpers: \{ module: '@your\/core' \}/)
})

test('⑤ helpers.assumeGlobals is the explicit opt-in for hosts that inject the primitives', () => {
  const rootDir = makeFixture(
    {
      'src/a.ts': 'export function probe(alpha: unknown): boolean {\n  return typeof alpha === "string"\n}\n',
    },
    { assumeGlobals: true }
  )
  assert.equal(runCli(rootDir, 'run', '--fix', '--no-baseline').status, 0)
  const source = read(rootDir, 'src/a.ts')
  assert.match(source, /isString\(alpha\)/)
  assert.doesNotMatch(source, /^import /m)
})

test('⑤ an existing import from the same module is extended, not duplicated', () => {
  const rootDir = makeFixture(
    {
      'src/a.ts':
        "import { isNumber } from '@velaros-ai/core'\n\n" +
        'export function probe(alpha: unknown): boolean {\n  return typeof alpha === "string" && isNumber(1)\n}\n',
    },
    { helperModule: '@velaros-ai/core' }
  )
  assert.equal(runCli(rootDir, 'run', '--fix', '--no-baseline').status, 0)
  const source = read(rootDir, 'src/a.ts')
  assert.equal((source.match(/@velaros-ai\/core/g) ?? []).length, 1, 'exactly one import statement')
  assert.match(source, /import \{ isNumber, isString \} from '@velaros-ai\/core'/)
})

test('⑤ a multi-line sorted import block keeps its shape and sort order', () => {
  const rootDir = makeFixture(
    {
      'src/a.ts':
        "import {\n  isArray,\n  isNumber,\n  isTrue,\n} from '@velaros-ai/core'\n\n" +
        'export function probe(alpha: unknown): boolean {\n' +
        '  return typeof alpha === "string" && isArray([]) && isNumber(1) && isTrue(true)\n' +
        '}\n',
    },
    { helperModule: '@velaros-ai/core' }
  )
  assert.equal(runCli(rootDir, 'run', '--fix', '--no-baseline').status, 0)
  const source = read(rootDir, 'src/a.ts')
  assert.equal((source.match(/@velaros-ai\/core/g) ?? []).length, 1)
  assert.match(
    source,
    /import \{\n  isArray,\n  isNumber,\n  isString,\n  isTrue,\n\} from '@velaros-ai\/core'/,
    `expected an in-place sorted insertion, got:\n${source}`
  )
})

test('⑤ a type-only import of the same module is left alone; a value import is added next to it', () => {
  const rootDir = makeFixture(
    {
      'src/a.ts':
        "import type { Nullable } from '@velaros-ai/core'\n\n" +
        'export function probe(alpha: unknown): Nullable<boolean> {\n  return typeof alpha === "string"\n}\n',
    },
    { helperModule: '@velaros-ai/core' }
  )
  assert.equal(runCli(rootDir, 'run', '--fix', '--no-baseline').status, 0)
  const source = read(rootDir, 'src/a.ts')
  assert.match(source, /import type \{ Nullable \} from '@velaros-ai\/core'/)
  assert.match(source, /^import \{ isString \} from '@velaros-ai\/core'$/m)
})

test('⑤ a top-level declaration of the same name DECLINES the repair — the file is left alone', () => {
  // 顶层已经有一个同名的东西：那到底是不是我们要的那个原语，无从证明。补 import 会与它冲突，
  // 不补又等于把守卫悄悄接到别人的函数上。两种都不做，拒绝这次修复。
  const before =
    'const isString = (value: unknown): value is string => true\n\n' +
    'export function probe(alpha: unknown): boolean {\n  return typeof alpha === "string" && isString(alpha)\n}\n'
  const rootDir = makeFixture({ 'src/a.ts': before }, { helperModule: '@velaros-ai/core' })
  const fixed = runCli(rootDir, 'run', '--fix', '--no-baseline')
  assert.equal(read(rootDir, 'src/a.ts'), before)
  assert.match(fixed.stdout + fixed.stderr, /already bound at that position by a local declaration/)
})

test('⑤ (a) an unrelated LOCAL binding deep in another function does not suppress a top-level import', () => {
  // 旧口径是「全文件扫一遍有没有同名绑定」，于是不相干函数里的一个 `const isString` 就能
  // 挡掉顶层用法的 import：改写照做、import 不补 = TS2304 + TS2322 级联。
  const rootDir = makeFixture(
    {
      'src/a.ts':
        'export function unrelated(): boolean {\n' +
        '  const isString = false\n' +
        '  return isString\n' +
        '}\n\n' +
        'export function probe(alpha: unknown): boolean {\n  return typeof alpha === "string"\n}\n',
    },
    { helperModule: '@velaros-ai/core' }
  )
  assert.equal(runCli(rootDir, 'run', '--fix', '--no-baseline').status, 0)
  const source = read(rootDir, 'src/a.ts')
  assert.match(source, /return isString\(alpha\)/)
  assert.match(source, /^import \{ isString \} from '@velaros-ai\/core'$/m)
})

test('⑤ (b) a same-named symbol imported from ANOTHER module declines the repair', () => {
  // 这是最阴的一档：旧口径不看模块身份，于是修复把守卫接到了 './local-guards' 的同名函数上，
  // 编译通过、语义全错。
  const before =
    "import { isString } from './local-guards'\n\n" +
    'export function probe(alpha: unknown): boolean {\n' +
    '  return typeof alpha === "string" && isString("x")\n' +
    '}\n'
  const rootDir = makeFixture(
    { 'src/a.ts': before, 'src/local-guards.ts': 'export const isString = (v: unknown) => true\n' },
    { helperModule: '@velaros-ai/core' }
  )
  const fixed = runCli(rootDir, 'run', '--fix', '--no-baseline')
  assert.equal(read(rootDir, 'src/a.ts'), before)
  assert.match(fixed.stdout + fixed.stderr, /an import from '\.\/local-guards'/)
  assert.doesNotMatch(read(rootDir, 'src/a.ts'), /@velaros-ai\/core/)
})

test('⑤ (c) a parameter that would shadow the new import declines the repair', () => {
  // 函数参数根本不在旧检查面内（那里只看 VariableDeclaration），于是 import 补上了，
  // 又在被修的那个函数里被参数遮蔽——照样不编译。
  const before =
    'export function probe(alpha: unknown, isString: number): boolean {\n' +
    '  return typeof alpha === "string" && isString > 0\n' +
    '}\n'
  const rootDir = makeFixture({ 'src/a.ts': before }, { helperModule: '@velaros-ai/core' })
  const fixed = runCli(rootDir, 'run', '--fix', '--no-baseline')
  assert.equal(read(rootDir, 'src/a.ts'), before)
  assert.match(fixed.stdout + fixed.stderr, /a parameter of the enclosing function/)
})

test('⑤ several fixes in one file keep their offsets while the import is added once', () => {
  const rootDir = makeFixture(
    {
      'src/a.ts':
        'export function probe(alpha: unknown, beta: unknown, gamma: unknown): boolean {\n' +
        '  const first = typeof alpha === "string"\n' +
        '  const second = typeof beta === "number"\n' +
        '  const third = typeof gamma === "boolean"\n' +
        '  return first && second && third\n' +
        '}\n',
    },
    { helperModule: '@velaros-ai/core' }
  )
  assert.equal(runCli(rootDir, 'run', '--fix', '--no-baseline').status, 0)
  const source = read(rootDir, 'src/a.ts')
  assert.match(source, /const first = isString\(alpha\)/)
  assert.match(source, /const second = isNumber\(beta\)/)
  assert.match(source, /const third = isBoolean\(gamma\)/)
  assert.equal((source.match(/@velaros-ai\/core/g) ?? []).length, 1)
  assert.match(source, /import \{ isBoolean, isNumber, isString \} from '@velaros-ai\/core'/)
})

test('⑤ re-running --fix is idempotent: no duplicate import, no further rewrites', () => {
  const rootDir = makeFixture(
    {
      'src/a.ts': 'export function probe(alpha: unknown): boolean {\n  return typeof alpha === "string"\n}\n',
    },
    { helperModule: '@velaros-ai/core' }
  )
  assert.equal(runCli(rootDir, 'run', '--fix', '--no-baseline').status, 0)
  const once = read(rootDir, 'src/a.ts')
  assert.equal(runCli(rootDir, 'run', '--fix', '--no-baseline').status, 0)
  assert.equal(read(rootDir, 'src/a.ts'), once)
})

test('⑤ the import lands after the file header comment, not inside it', () => {
  const rootDir = makeFixture(
    {
      'src/a.ts':
        '/**\n * 文件头说明。\n */\n\nexport function probe(alpha: unknown): boolean {\n  return typeof alpha === "string"\n}\n',
    },
    { helperModule: '@velaros-ai/core' }
  )
  assert.equal(runCli(rootDir, 'run', '--fix', '--no-baseline').status, 0)
  const source = read(rootDir, 'src/a.ts')
  const importIndex = source.indexOf('import {')
  assert.ok(importIndex > source.indexOf('*/'), 'the import must sit below the header block')
  assert.match(source, /isString\(alpha\)/)
})

test('⑤ a JSDoc attached to the first statement is not split from the statement it documents', () => {
  // `getStart()` 跳过全部 trivia，于是紧贴首个语句的 JSDoc 也被当成「文件头」，
  // import 插进了注释与它描述的符号之间。判据得是空行：隔了空行才是游离的文件头。
  const rootDir = makeFixture(
    {
      'src/a.ts':
        '/** 判断入参是不是字符串。 */\n' +
        'export function probe(alpha: unknown): boolean {\n  return typeof alpha === "string"\n}\n',
    },
    { helperModule: '@velaros-ai/core' }
  )
  assert.equal(runCli(rootDir, 'run', '--fix', '--no-baseline').status, 0)
  const source = read(rootDir, 'src/a.ts')
  assert.ok(
    source.indexOf('import {') < source.indexOf('/** 判断入参'),
    `the import must sit above the JSDoc, got:\n${source}`
  )
  assert.match(source, /\/\*\* 判断入参是不是字符串。 \*\/\nexport function probe/)
})

test('⑤ a shebang keeps the first line', () => {
  const rootDir = makeFixture(
    {
      'src/a.ts':
        '#!/usr/bin/env node\nexport function probe(alpha: unknown): boolean {\n  return typeof alpha === "string"\n}\n',
    },
    { helperModule: '@velaros-ai/core' }
  )
  assert.equal(runCli(rootDir, 'run', '--fix', '--no-baseline').status, 0)
  const source = read(rootDir, 'src/a.ts')
  assert.ok(source.startsWith('#!/usr/bin/env node\n'), `shebang moved:\n${source}`)
  assert.match(source, /^import \{ isString \} from '@velaros-ai\/core'$/m)
})

// ——— 绑定身份：模块对了不等于符号对了 ————————————————————————————

test('⑤ (d) an ALIASED import from the target module is NOT the primitive — the repair is declined', () => {
  // 旧口径只比模块说明符：`import { toOptional as isString } from '@velaros-ai/core'` 被判成
  // 「已经满足」，于是不补 import，而改写出的 `isString(alpha)` 调的是 `toOptional`。
  // 编译得过、语义全错——比 TS2304 更难发现的一档。
  const before =
    "import { toOptional as isString } from '@velaros-ai/core'\n\n" +
    'export function probe(alpha: unknown): boolean {\n  return typeof alpha === "string"\n}\n'
  const rootDir = makeFixture({ 'src/a.ts': before }, { helperModule: '@velaros-ai/core' })
  const fixed = runCli(rootDir, 'run', '--fix', '--no-baseline')
  assert.equal(read(rootDir, 'src/a.ts'), before, 'the file must be byte-identical')
  assert.match(fixed.stdout + fixed.stderr, /aliased import \(`toOptional as isString`\)/)
})

test('⑤ (d2) a redundant self-alias IS the primitive and stays satisfied', () => {
  // 对照组：`{ isString as isString }` 绑的确实是那个导出，不该被这条收紧误伤。
  const rootDir = makeFixture(
    {
      'src/a.ts':
        "import { isString as isString } from '@velaros-ai/core'\n\n" +
        'export function probe(alpha: unknown): boolean {\n  return typeof alpha === "string"\n}\n',
    },
    { helperModule: '@velaros-ai/core' }
  )
  assert.equal(runCli(rootDir, 'run', '--fix', '--no-baseline').status, 0)
  const source = read(rootDir, 'src/a.ts')
  assert.match(source, /return isString\(alpha\)/)
  assert.equal((source.match(/@velaros-ai\/core/g) ?? []).length, 1, 'no second import statement')
})

test('⑤ (e) a type-only import occupies the name in value space — aliased or not', () => {
  // 「类型空间不算绑定」这个前提是错的：`import type { X }` 在值空间同样占着这个名字。
  // 再补一条同名值 import 是 TS2300，直接当值用是 TS1361。旧实现把整条 type-only import
  // 丢掉，于是照补不误。
  for (const [label, line] of [
    ['aliased', "import type { Nullable as isString } from '@velaros-ai/core'"],
    ['plain', "import type { isString } from '@velaros-ai/core'"],
    ['inline', "import { type isString } from '@velaros-ai/core'"],
  ]) {
    const before =
      `${line}\n\n` +
      'export function probe(alpha: unknown): boolean {\n  return typeof alpha === "string"\n}\n'
    const rootDir = makeFixture({ 'src/a.ts': before }, { helperModule: '@velaros-ai/core' })
    const fixed = runCli(rootDir, 'run', '--fix', '--no-baseline')
    assert.equal(read(rootDir, 'src/a.ts'), before, `${label}: the file must be byte-identical`)
    assert.match(fixed.stdout + fixed.stderr, /declined 1 autofix/, label)
  }
})

test('⑤ (f) a top-level binding is seen even when the fix offset predates the first token', () => {
  // 顶层作用域曾经从 `sourceFile.getStart()` 起算（跳过文件头 trivia），而 fixer 用
  // `node.getFullStart()` 提问——首个语句上就是 0。0 落在区间外 → 顶层绑定整体看不见 →
  // 判「名字自由」→ 改写照做，`isFunction` 悄悄接到了本文件的同名 const 上。
  const before =
    '/** 文件头说明。 */\n\n' +
    'typeof helper === "function" || fail()\n\n' +
    'function helper(): void {}\n' +
    "function fail(): never { throw new Error('missing') }\n" +
    'const isFunction = (value: unknown): boolean => Boolean(value)\n' +
    'export const keep = isFunction\n'
  const rootDir = makeFixture({ 'src/a.ts': before }, { helperModule: '@velaros-ai/core' })
  const fixed = runCli(rootDir, 'run', '--fix', '--no-baseline')
  assert.equal(read(rootDir, 'src/a.ts'), before, 'the file must be byte-identical')
  assert.match(fixed.stdout + fixed.stderr, /`isFunction` is already bound at that position/)
})

test('⑤ (g) verify --fix reports the repairs it declined instead of swallowing them', () => {
  // verify 的 logLevel 曾被钉死在 error 档，而 reportDeclinedFixes 与「改写了但 import 没补上」
  // 都是 warn——`verify --fix`（CLI 接受、resolveCliFix 也认）下每一条被拒的修复都是静默的。
  const before =
    'export function probe(alpha: unknown): boolean {\n  return typeof alpha === "string"\n}\n'
  const rootDir = makeFixture({ 'src/a.ts': before })
  const verified = runCli(rootDir, 'verify', '--fix', '--no-baseline')
  assert.equal(read(rootDir, 'src/a.ts'), before)
  assert.match(
    verified.stdout + verified.stderr,
    /declined 1 autofix/,
    `verify --fix must not swallow refusals:\n${verified.stdout}${verified.stderr}`
  )
  // 一行短输出的契约仍然成立：告警走 stderr，stdout 只有结论。
  assert.match(verified.stdout.trim(), /^arch-guard: (PASS|FAIL)\b/)
})
