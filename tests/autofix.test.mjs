import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { defineCheck, runArchGuard } from '@velaros-ai/arch-guard'

function temporaryProject(prefix) {
  return mkdtempSync(join(tmpdir(), prefix))
}

function configFor(rootDir, check) {
  return { rootDir, plugins: [], checks: [check] }
}

test('deduplicates fixes at the same phase and source offset', async () => {
  const rootDir = temporaryProject('arch-guard-same-offset-')
  const relativeFile = 'sample.ts'
  const file = join(rootDir, relativeFile)
  writeFileSync(file, 'const value = BAD\n', 'utf8')
  let applied = 0

  const check = defineCheck({
    id: 'test/same-offset',
    title: 'Same offset safety',
    description: 'Duplicate reports for one source range apply once.',
    verifies: ['A source range is not rewritten twice in one pass.'],
    run({ context, report }) {
      const source = context.cache.readSource(file)
      const start = source.indexOf('BAD')
      if (start < 0) return
      for (const ruleId of ['first', 'second']) {
        report.section('Unsafe token').add({
          ruleId,
          file: relativeFile,
          message: 'Replace BAD.',
          fixPhase: 10,
          fixStartOffset: start,
          applyFix(fix) {
            applied += 1
            fix.replaceTextRange(
              relativeFile,
              { start, end: start + 3 },
              'GOOD',
              { preserveLeadingTrivia: false }
            )
          },
        })
      }
    },
  })

  const result = await runArchGuard({
    config: configFor(rootDir, check),
    reporters: [],
    ignoreBaseline: true,
    fix: true,
  })

  assert.equal(readFileSync(file, 'utf8'), 'const value = GOOD\n')
  assert.equal(applied, 1)
  assert.equal(result.exitCode, 0)
})

test('reruns analysis between fix phases so later offsets are fresh', async () => {
  const rootDir = temporaryProject('arch-guard-fix-phases-')
  const relativeFile = 'sample.ts'
  const file = join(rootDir, relativeFile)
  writeFileSync(file, 'const pair = __A__ + __B__\n', 'utf8')

  const check = defineCheck({
    id: 'test/phased-fix',
    title: 'Phased fix safety',
    description: 'Each phase is analyzed from the latest source.',
    verifies: ['Later phases never reuse stale source offsets.'],
    run({ context, report }) {
      const source = context.cache.readSource(file)
      for (const [token, replacement, phase] of [
        ['__A__', 'ALPHA', 10],
        ['__B__', 'BETA', 20],
      ]) {
        const start = source.indexOf(token)
        if (start < 0) continue
        report.section('Tokens').add({
          ruleId: token.toLowerCase(),
          file: relativeFile,
          message: `Replace ${token}.`,
          fixPhase: phase,
          fixStartOffset: start,
          applyFix(fix) {
            fix.replaceTextRange(
              relativeFile,
              { start, end: start + token.length },
              replacement,
              { preserveLeadingTrivia: false }
            )
          },
        })
      }
    },
  })

  const result = await runArchGuard({
    config: configFor(rootDir, check),
    reporters: [],
    ignoreBaseline: true,
    fix: true,
  })

  assert.equal(readFileSync(file, 'utf8'), 'const pair = ALPHA + BETA\n')
  assert.equal(result.exitCode, 0)
})

test('refuses an autofix path that escapes rootDir', async () => {
  const outerDir = temporaryProject('arch-guard-path-boundary-')
  const rootDir = join(outerDir, 'project')
  mkdirSync(rootDir)
  const escapedFile = join(outerDir, 'escaped.ts')
  let attempted = false

  const check = defineCheck({
    id: 'test/path-boundary',
    title: 'Autofix path boundary',
    description: 'Autofix writes stay inside rootDir.',
    verifies: ['A plugin cannot accidentally write through a parent path.'],
    run({ report }) {
      report.add({
        ruleId: 'escape',
        file: 'placeholder.ts',
        message: 'Attempt an escaping write.',
        fixStartOffset: 0,
        applyFix(fix) {
          attempted = true
          fix.writeTextFile('../escaped.ts', 'unsafe\n')
        },
      })
    },
  })

  const result = await runArchGuard({
    config: configFor(rootDir, check),
    reporters: [],
    ignoreBaseline: true,
    fix: true,
    maxFixIterations: 1,
  })

  assert.equal(attempted, true)
  assert.equal(existsSync(escapedFile), false)
  assert.equal(result.exitCode, 1)
})
