import assert from 'node:assert/strict'
import test from 'node:test'

import {
  defineConfig,
  defineCheck,
  definePlugin,
  runArchGuard,
} from '@velaros-ai/arch-guard'
import { crossFileDuplication } from '@velaros-ai/arch-guard/checks'
import * as pluginApi from '@velaros-ai/arch-guard/plugin'
import * as reporters from '@velaros-ai/arch-guard/reporters'

test('documents a small set of stable package entrypoints', async () => {
  assert.equal(typeof defineConfig, 'function')
  assert.equal(typeof defineCheck, 'function')
  assert.equal(typeof definePlugin, 'function')
  assert.equal(typeof runArchGuard, 'function')
  assert.equal(crossFileDuplication.id, 'duplication/cross-file')
  assert.equal(typeof pluginApi.parseSourceFile, 'function')
  assert.equal(typeof reporters.sarifReporter, 'function')

  await assert.rejects(
    import('@velaros-ai/arch-guard/core'),
    (error) => error?.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED'
  )
})

test('composes project checks through a plugin without engine-specific policy', async () => {
  const check = defineCheck({
    id: 'example/always-pass',
    title: 'Example boundary',
    description: 'A consumer-defined project boundary.',
    verifies: ['The check can run through the public plugin contract.'],
    run() {},
  })
  const plugin = definePlugin({ name: 'example', version: '1.0.0', checks: [check] })
  const config = defineConfig({ plugins: [plugin] })
  const result = await runArchGuard({
    config: { rootDir: process.cwd(), plugins: config.plugins ?? [], checks: [] },
    reporters: [],
    ignoreBaseline: true,
  })

  assert.equal(result.exitCode, 0)
  assert.equal(result.aggregate.summary().totalChecks, 1)
})
