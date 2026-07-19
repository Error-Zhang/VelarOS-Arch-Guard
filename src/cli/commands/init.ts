import { existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { type ParsedArgs, toString } from '../argv'

const DefaultConfigName = 'arch-guard.config.mjs'

const StarterConfig = `import { defineConfig } from '@velaros/arch-guard'
import { crossFileDuplication } from '@velaros/arch-guard/checks'

export default defineConfig({
  files: {
    roots: ['src'],
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
    excludePatterns: ['**/node_modules/**', '**/dist/**', '**/coverage/**'],
  },
  checks: [crossFileDuplication],
})
`

function initCommand(parsed: ParsedArgs): number {
  const target = resolve(process.cwd(), toString(parsed.options.config) ?? DefaultConfigName)
  if (existsSync(target)) {
    console.error(`arch-guard: refusing to overwrite existing config at ${target}`)
    return 1
  }

  writeFileSync(target, StarterConfig, 'utf-8')
  console.info(`arch-guard: created ${target}`)
  console.info('Next: run `arch-guard doctor`, then `arch-guard run`.')
  return 0
}

export { initCommand }
