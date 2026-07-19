import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  defineCheck,
  runArchGuard,
  writeBaselineFile,
} from '@velaros/arch-guard'
import { jsonReporter, sarifReporter } from '@velaros/arch-guard/reporters'

test('writes a baseline that suppresses the same stable violation', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'arch-guard-baseline-'))
  const baselinePath = join(rootDir, '.arch-guard', 'baseline.json')
  const check = defineCheck({
    id: 'test/baseline',
    title: 'Baseline contract',
    description: 'Stable violations can be adopted incrementally.',
    verifies: ['Existing debt can be snapshotted without disabling the check.'],
    run({ report }) {
      report.add({ ruleId: 'legacy', file: 'src/legacy.ts', message: 'Legacy boundary.' })
    },
  })
  const config = { rootDir, plugins: [], checks: [check] }

  const first = await runArchGuard({ config, reporters: [], ignoreBaseline: true })
  assert.equal(first.exitCode, 1)
  writeBaselineFile(baselinePath, first.aggregate.allViolations)

  const second = await runArchGuard({ config, reporters: [] })
  assert.equal(second.exitCode, 0)
  assert.equal(second.aggregate.allViolations.length, 0)
})

test('emits machine-readable JSON and SARIF reports', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'arch-guard-reporters-'))
  const check = defineCheck({
    id: 'test/reporter',
    title: 'Reporter contract',
    description: 'Violations are available to automation.',
    verifies: ['JSON and SARIF preserve the check identity.'],
    run({ report }) {
      report.add({ ruleId: 'failure', file: 'src/file.ts', line: 3, message: 'Broken.' })
    },
  })
  const config = { rootDir, plugins: [], checks: [check] }

  await runArchGuard({
    config,
    reporters: [
      jsonReporter({ out: 'reports/result.json' }),
      sarifReporter({ out: 'reports/result.sarif', toolVersion: 'test' }),
    ],
    ignoreBaseline: true,
  })

  const json = JSON.parse(readFileSync(join(rootDir, 'reports/result.json'), 'utf8'))
  const sarif = JSON.parse(readFileSync(join(rootDir, 'reports/result.sarif'), 'utf8'))
  assert.equal(json.reports[0].checkId, 'test/reporter')
  assert.equal(sarif.runs[0].tool.driver.name, 'arch-guard')
  assert.equal(sarif.runs[0].results[0].ruleId, 'test/reporter/failure')
})

test('accepts an English reason in a traceable inline suppression', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'arch-guard-suppression-'))
  writeFileSync(
    join(rootDir, 'sample.ts'),
    '// @arch-guard:suspend test/suppressed Reason: compatibility path tracked in issue 123.\nlegacyCall()\n',
    'utf8'
  )
  const check = defineCheck({
    id: 'test/suppressed',
    title: 'Suppression contract',
    description: 'Traceable suppressions can cover a local violation.',
    verifies: ['English Reason markers are supported.'],
    run({ report }) {
      report.add({ ruleId: 'legacy', file: 'sample.ts', line: 2, message: 'Legacy call.' })
    },
  })

  const result = await runArchGuard({
    config: { rootDir, plugins: [], checks: [check] },
    reporters: [],
    ignoreBaseline: true,
  })

  assert.equal(result.exitCode, 0)
  assert.equal(result.aggregate.allViolations.length, 0)
})
