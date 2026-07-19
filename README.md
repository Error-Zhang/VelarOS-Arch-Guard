# VelarOS Arch Guard

[![CI](https://github.com/Error-Zhang/VelarOS-Arch-Guard/actions/workflows/ci.yml/badge.svg)](https://github.com/Error-Zhang/VelarOS-Arch-Guard/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-171916.svg)](LICENSE)

VelarOS Arch Guard is an extensible architecture policy engine for JavaScript and TypeScript projects. It turns repository-specific boundaries into executable checks without coupling the engine to a framework, build tool, or application.

The engine provides:

- a typed check and plugin API;
- deterministic file collection and shared source/AST caches;
- rule severity and option overrides;
- diff, staged-file, tag, and path-scoped execution;
- baselines for adopting checks in existing repositories;
- opt-in, staged autofix with atomic writes;
- stylish, JSON, SARIF, and GitHub Actions reporters.

Project policy does not belong in this package. Package boundaries, forbidden imports, naming rules, framework conventions, and product architecture should live in a project plugin.

[中文文档](README.zh-CN.md)

## Install

The verified `v0.1.0` package is currently available from the GitHub release tag:

```bash
npm install --save-dev github:Error-Zhang/VelarOS-Arch-Guard#v0.1.0
```

It is installed under the package name `@velaros/arch-guard`, so the documented
imports and CLI commands are identical. npm registry publication is prepared but
not yet live; after it is published, the canonical registry command will be
`npm install --save-dev @velaros/arch-guard`.

Node.js 20 or newer is required. The CLI and library run on Node; Bun is not required.

## Quick start

Create a starter configuration:

```bash
npx arch-guard init
```

That produces `arch-guard.config.mjs` with the generic cross-file duplication check enabled:

```js
import { defineConfig } from '@velaros/arch-guard'
import { crossFileDuplication } from '@velaros/arch-guard/checks'

export default defineConfig({
  files: {
    roots: ['src'],
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
    excludePatterns: ['**/node_modules/**', '**/dist/**', '**/coverage/**'],
  },
  checks: [crossFileDuplication],
})
```

Validate the configuration, then run it:

```bash
npx arch-guard doctor
npx arch-guard run
```

Add stable scripts to the consuming project instead of coupling CI to a package-manager-specific command:

```json
{
  "scripts": {
    "arch:check": "arch-guard run",
    "arch:changed": "arch-guard run --changed",
    "arch:verify": "arch-guard verify"
  }
}
```

## CLI

```text
arch-guard init
arch-guard doctor
arch-guard run [files...]
arch-guard verify
arch-guard list [--by-tag | --json | --ids-only]
arch-guard explain <check-id>
arch-guard baseline update|check
```

Common scoping and output options:

```bash
arch-guard run src/main.ts packages/core/src
arch-guard run --changed --base main
arch-guard run --staged
arch-guard run --only duplication/cross-file
arch-guard run --tag architecture
arch-guard run --format stylish --format sarif --out reports/arch-guard.sarif
```

Use `arch-guard help` for the complete option list.

## Write a check

The `plugin` entrypoint is the supported authoring surface. Checks receive a repository context and a structured report builder:

```js
import { defineCheck, toRelativePosix } from '@velaros/arch-guard/plugin'

export const noDirectDatabaseImports = defineCheck({
  id: 'example/no-direct-database-imports',
  title: 'Database access boundary',
  description: 'Application modules access the database through the data package.',
  verifies: ['Source files outside packages/data do not import the database client.'],
  tags: ['architecture', 'imports'],
  appliesTo: { include: ['src/**/*.{js,ts,tsx}'] },
  run({ context, report }) {
    const section = report.section('Direct database imports')
    for (const file of context.files.collect(['src'], new Set(['.js', '.ts', '.tsx']))) {
      const source = context.cache.readSource(file)
      if (!source.includes("from 'database-client'")) continue
      section.add({
        ruleId: 'direct-import',
        file: toRelativePosix(context.rootDir, file),
        message: 'Import the data package instead of database-client.',
      })
    }
  },
})
```

Register a check directly in a config, or publish a plugin:

```js
import { definePlugin } from '@velaros/arch-guard/plugin'
import { noDirectDatabaseImports } from './checks/no-direct-database-imports.mjs'

export default function exampleArchitecture() {
  return definePlugin({
    name: 'example-architecture',
    version: '1.0.0',
    checks: [noDirectDatabaseImports],
  })
}
```

The package exports four deliberate surfaces:

- `@velaros/arch-guard` — configuration, runner, and result models;
- `@velaros/arch-guard/plugin` — check/plugin contracts and supported analysis helpers;
- `@velaros/arch-guard/checks` — generic built-in checks;
- `@velaros/arch-guard/reporters` — reporter factories.

Internal source paths are not public API.

## Adopt with a baseline

Existing repositories can record current violations without disabling a check:

```bash
arch-guard baseline update
arch-guard run
```

The default snapshot is `.arch-guard/baseline.json`. Future runs report violations that are not covered by the snapshot and can prune stale entries. Commit the baseline when it represents an intentional migration boundary.

## Autofix safety

Autofix is disabled unless the config sets `fix: true` or the CLI receives `--fix`.

```bash
arch-guard run --changed --fix
```

Fix-capable checks attach a repair function to a violation. The engine:

1. groups repairs by file and fix phase;
2. applies only the earliest phase for each file in a pass;
3. applies offsets from right to left and deduplicates identical offsets;
4. writes atomically;
5. clears caches and reruns checks before the next phase;
6. stops at a bounded iteration limit.

Review the diff after autofix. Plugin authors should keep fixes deterministic and narrowly scoped.

## Temporary suppressions

Suppressions are evaluated before baseline matching. They require a check id and a reason on the same line.

```js
// @arch-guard:suspend-file example/generated-contract Reason: generated by schema compiler; tracked in issue #123.
```

```js
// @arch-guard:suspend example/legacy-boundary Reason: compatibility adapter removed after issue #456.
legacyCall()
```

Use suppressions as traceable debt, not as a replacement for configuration.

## Development

```bash
npm install
npm run check
```

`npm run check` type-checks, builds, runs the Node test suite, and validates the package contents. See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution boundaries and [SECURITY.md](SECURITY.md) for vulnerability reporting.

## License

MIT © Error-Zhang
