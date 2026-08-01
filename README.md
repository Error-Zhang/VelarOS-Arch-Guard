# VelarOS Arch Guard

[![CI](https://github.com/Error-Zhang/VelarOS-Arch-Guard/actions/workflows/ci.yml/badge.svg)](https://github.com/Error-Zhang/VelarOS-Arch-Guard/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/%40velaros-ai%2Farch-guard.svg)](https://www.npmjs.com/package/@velaros-ai/arch-guard)
[![License: MIT](https://img.shields.io/badge/License-MIT-171916.svg)](LICENSE)

VelarOS Arch Guard is an extensible architecture policy engine for JavaScript and TypeScript projects. It turns repository-specific boundaries into executable checks without coupling the engine to a framework, build tool, or application.

It was extracted from the architecture enforcement path used by VelarOS Desktop.
The public project owns the reusable engine and plugin contract; VelarOS-specific
package names, paths, baselines, and product policy remain in a private downstream
plugin.

The engine provides:

- a typed check and plugin API;
- deterministic file collection and shared source/AST caches;
- rule severity and option overrides;
- diff, staged-file, tag, and path-scoped execution;
- baselines for adopting checks in existing repositories;
- opt-in, staged autofix with atomic writes;
- stylish, JSON, SARIF, and GitHub Actions reporters.

Project policy does not belong in this package. Package boundaries, forbidden imports, naming rules, framework conventions, and product architecture should live in a project plugin.

[中文文档](README.zh-CN.md) · [Engineering article](https://global.velaros.cn/blog/open-sourcing-arch-guard)

## Install

```bash
npm install --save-dev @velaros-ai/arch-guard
```

Installing a tagged Git release also works — the repository versions `dist/`, so
package managers can consume `Error-Zhang/VelarOS-Arch-Guard#v0.1.1` without a
build step. The npm registry package is the recommended source.

Node.js 20 or newer is required. The CLI and library run on Node; Bun is not required.

## Quick start

Create a starter configuration:

```bash
npx arch-guard init
```

That produces `arch-guard.config.mjs` with the generic cross-file duplication check enabled:

```js
import { defineConfig } from '@velaros-ai/arch-guard'
import { crossFileDuplication } from '@velaros-ai/arch-guard/checks'

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
arch-guard baseline update|prune|migrate|check
```

Only `baseline update`, `baseline prune` and `baseline migrate` write the baseline. `run` and
`verify` are strictly read-only.

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
import { defineCheck, toRelativePosix } from '@velaros-ai/arch-guard/plugin'

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
import { definePlugin } from '@velaros-ai/arch-guard/plugin'
import { noDirectDatabaseImports } from './checks/no-direct-database-imports.mjs'

export default function exampleArchitecture() {
  return definePlugin({
    name: 'example-architecture',
    version: '1.0.0',
    checks: [noDirectDatabaseImports],
  })
}
```

The package exports five deliberate surfaces:

- `@velaros-ai/arch-guard` — configuration, runner, and result models;
- `@velaros-ai/arch-guard/plugin` — check/plugin contracts and supported analysis helpers;
- `@velaros-ai/arch-guard/checks` — generic built-in checks;
- `@velaros-ai/arch-guard/checks/code-style` — the optional code-style ruleset (see below);
- `@velaros-ai/arch-guard/reporters` — reporter factories.

Internal source paths are not public API.

## Optional ruleset: `code-style/*`

`@velaros-ai/arch-guard/checks/code-style` ships an **opt-in** ruleset of language-level
writing rules — absence-value expression, single-source type guards, early return over deep
nesting, table-driven branching, identity forwarders, redundant strict comparisons, swallowed
errors, React conditional rendering, team-language comments. Nothing here is enabled by
default: you register the checks explicitly.

These rules are opinionated. They judge TypeScript and JavaScript constructs only — no product
architecture — but several of them recommend a **helper vocabulary** (`isPresent`,
`isPlainObject`, `optionalWhen`, `isEmpty`, `stringifyPretty`, `Nullable<T>` …) shipped by
`@velaros-ai/core`. Adopt them if that vocabulary — or your own equivalent — exists in your
codebase; skip them otherwise. Repository coordinates are never hard-coded: every rule reads
its scanning scope from check options.

```js
import { defineConfig, definePlugin } from '@velaros-ai/arch-guard'
import { codeStyleChecks, createCodeStyleDefaults } from '@velaros-ai/arch-guard/checks/code-style'

const codeStyle = definePlugin({
  name: 'my-code-style',
  checks: codeStyleChecks,
  defaults: createCodeStyleDefaults({
    scope: {
      scanRoots: ['packages'],
      runtimeRoots: ['packages/'],          // most rules only scan runtime source
      frontendRoots: ['packages/ui/src/'],  // JSX rules only scan the frontend
      skipPatterns: ['^packages/core/src/typeGuards\\.ts$'],
    },
    perCheck: {
      'code-style/forbid-raw-timers': { allowFiles: ['packages/core/src/utils/TimerScope.ts'] },
    },
  }),
})

export default defineConfig({ plugins: [codeStyle], files: { roots: ['packages'] } })
```

Every scope field is optional; an omitted field means "do not filter". Adopt the ruleset on an
existing repository the same way as any other check — freeze the current violations with
`arch-guard baseline update`, then let the ratchet fail new ones.

`code-style/require-chinese-comments` enforces a team language for explanatory comments. It
exempts JSDoc blocks attached to exported declarations (public API documentation is written for
external consumers); set `exemptExportedJsDoc: false` to enforce everywhere.

## Adopt with a baseline

Existing repositories can record current violations without disabling a check:

```bash
arch-guard baseline update
arch-guard run
```

The default snapshot is `.arch-guard/baseline.json`. Future runs report violations that are not
covered by the snapshot. Commit the baseline when it represents an intentional migration boundary.

### The baseline is a ratchet, so only three commands may write it

| command | effect |
| --- | --- |
| `baseline update` | re-freeze violations. Honours `--file` / `--changed` / `--staged` / `--only` / `--skip` / `--tag`; a scoped update **merges** — entries outside the scope are left byte-for-byte alone, and violations outside the scope are not frozen either |
| `baseline prune` | retire entries that no longer match anything, and shrink occurrence counts down to what this run actually found. Refuses to run under a scope, and refuses to empty a baseline that this run matched nothing of (`--force` overrides) |
| `baseline migrate` | backfill `contentDigest` and occurrence counts on entries written by older versions, and report exactly how many waivers the migration takes away |

Everything else is read-only. Concretely:

* `run`, `verify`, `list`, `explain`, `doctor` never touch the file. Before 0.3.0 `run` pruned
  stale entries **by default**, which made "read the violations" a mutating operation: one
  `arch-guard run` could turn a red tree green, and a `git checkout` of the baseline could turn it
  red again. `--no-prune-stale-baseline` is still accepted and now does nothing.
* A bare `arch-guard baseline` prints usage and exits 2. There is no default action — the word you
  type to discover the sub-commands must not rewrite the ratchet.
* `--dry-run` prints the full diff and writes nothing. Unknown long options are rejected with
  exit 2 rather than ignored, so a typo in `--dry-run` cannot quietly turn into a write.
* A scope that resolves to **zero** scannable files (`--changed` when the diff is all `.md`,
  `--staged` with nothing TypeScript staged) is a no-op, not a whole-repository re-freeze. Read
  commands still run — checks that ignore the file scan surface report repository-wide, and
  skipping them would weaken the gate — but they say that no file was scanned, so "scanned
  nothing" never looks like "found nothing". `verify --json` carries it as `emptyFileScope`.
* Any write that would produce byte-identical content is skipped, so the file's mtime only moves
  when the ratchet actually moved.

Prefer a scoped update. An unscoped `baseline update` freezes *everything* currently reported,
including debt written by somebody else since the last freeze; it prints every newly frozen entry,
and every entry whose occurrence count grew, so that is at least visible.

**`--skip` is not a scope.** It names what to leave out, which leaves every *other* check covering
the whole repository, so `baseline update --skip X` is a full re-freeze. It is still honoured as a
merge directive — entries belonging to `X` are preserved byte-for-byte — but the summary reports it
as `whole repository, minus --skip X` and keeps the "you are freezing debt you did not write"
warning. Narrow with `--file` / `--changed` / `--staged` / `--only` / `--tag`.

### Entry identity, and what it cannot do yet

An entry is keyed by `checkId + ruleId + fingerprint`, where the fingerprint is a hash of whatever
the check passes as `fingerprintInput`. Checks commonly build that from `file::line::kind`, which
means two *different* violations on the same line of the same file under the same rule hash to the
same value — and the ratchet then waives a violation it has never seen. Identity therefore has two
more parts:

* **`contentDigest`** — a hash of the violation message with its `path:line:` prefix removed.
  A waiver requires the fingerprint *and* the digest to match.
* **`count`** — how many occurrences the entry waives (absent = 1). Matching by key alone is a map
  lookup with no arithmetic, so one frozen record would waive an unbounded number of identical
  violations: freeze one `typeof x === 'string'`, then paste three copies onto that line, and the
  gate stays green. Digests do not help there — three byte-identical expressions have the same
  digest. Only counting does.

How that plays with existing baselines:

* Entries without a digest (written by ≤ 0.2.x) keep the old fingerprint-only, uncounted behaviour,
  so an existing baseline needs **no** migration to keep working, byte-for-byte.
* `baseline update` writes digests and counts for everything it freezes.
* `baseline migrate` backfills them. The content comes from the entry's own frozen message, not
  from today's code, so a frozen entry that no longer matches today's code is reported and starts
  failing the gate instead of silently covering the newcomer. **Every** entry gets a digest,
  including the ones this run cannot match: their message is right there in the file, the digest is
  computable offline, and leaving them bare would keep handing that `(file, line, rule)` slot a
  blank cheque for any future violation. `migrate --dry-run` reports the exact number of
  currently-waived violations that will stop being waived, by running the whole violation set
  through both the old and the new baseline.

Known gaps, in the order they hurt:

1. The fingerprint still carries the line number, so moving code (or adding an import above it)
   makes a frozen entry go stale and reports the unchanged violation as new. Re-anchor with
   `baseline update --file <moved file>`.
2. Some rules build a message that does not name the offending code (`forbid-swallowed-errors`,
   `require-error-logging`, `forbid-redundant-else-after-return`). For those the digest degenerates
   to a per-rule constant and adds no discrimination — the fingerprint and the count are all that
   constrain them. Item 2 of the roadmap below is the fix.

### Baseline roadmap

1. **Content-keyed count ratchet.** Replace per-occurrence fingerprints with
   `(file, checkId, ruleId, contentKey) → count`. Reordering, reformatting, line drift and added
   imports stop mattering; adding an N+1-th occurrence of the same shape still fails; merge
   conflicts degrade to comparing two integers instead of reconciling opaque hashes.
2. **`ViolationInput.contentKey`.** Let checks declare a line-free content key explicitly instead
   of deriving it from the message, so a reworded message does not invalidate a digest — and so
   rules whose message carries no per-violation content stop degenerating to a constant.
3. **Structural anchors** (`file > enclosing named scope > expression text`) for the reviewer-facing
   `examples[]` list, which stays non-authoritative and is allowed to go stale.

### Baseline roadmap

1. **Content-keyed count ratchet.** Replace per-occurrence fingerprints with
   `(file, checkId, ruleId, contentKey) → count`. Reordering, reformatting, line drift and added
   imports stop mattering; adding an N+1-th occurrence of the same shape still fails; merge
   conflicts degrade to comparing two integers instead of reconciling opaque hashes.
2. **`ViolationInput.contentKey`.** Let checks declare a line-free content key explicitly instead
   of deriving it from the message, so a reworded message does not invalidate a digest.
3. **Structural anchors** (`file > enclosing named scope > expression text`) for the reviewer-facing
   `examples[]` list, which stays non-authoritative and is allowed to go stale.

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
5. adds any imports the repairs asked for, **after** every replacement in the pass has landed;
6. clears caches and reruns checks before the next phase;
7. stops at a bounded iteration limit.

Review the diff after autofix. Plugin authors should keep fixes deterministic and narrowly scoped.

### Repairs that introduce a name

A repair that rewrites `typeof x === 'string'` into `isString(x)` introduces an identifier the file
may not have. Two calls handle it:

* `fix.planNamedImport(file, module, name, offset)` — ask, **before writing anything**, whether the
  name is usable at that position. `satisfied` means a value import of that name from that module
  already resolves there; `insert` means the name is free; `blocked` means something else owns it.
* `fix.requireNamedImport(file, module, name)` — declare the import. The engine defers the
  insertion to the end of the pass (an import at the top of the file would invalidate every offset
  the other repairs are holding), re-reads the file, and is idempotent: an existing value import
  from the same module is extended in place, and a type-only import of the same module is not
  repurposed.

**A repair that gets `blocked` must throw, not proceed.** Writing the expression and skipping the
import is the worst possible outcome — the file no longer compiles and nothing said so. The engine
catches the throw, leaves the file untouched, and prints one aggregated line per reason at the end
of the pass; the violation itself stays red, so nothing is lost.

`planNamedImport` resolves the name the way TypeScript does, not by scanning the file for a
matching string. Three shapes that a whole-file "is this name bound anywhere?" test gets wrong:

* an unrelated `const isString` inside *another* function suppresses the import that top-level code
  needs (repair written, import missing);
* a same-named symbol imported from a *different* module suppresses it, and the repair silently
  wires the guard to a foreign function (compiles, wrong semantics);
* a function **parameter** named `isString` is not a variable declaration at all, so the import is
  added and then shadowed inside the very function being repaired.

The bundled `code-style` ruleset emits ~28 such primitives, so it needs to be told where they live:

```js
createCodeStyleDefaults({
  scope: { /* … */ },
  helpers: {
    module: '@your-scope/core',
    bySymbol: { stringifyPretty: '@your-scope/core/json' },
  },
})
```

**Without a `helpers` block those repairs are declined, loudly, and nothing is written.** Silence
was the old behaviour and it was wrong: `--fix` produced `TS2304` plus a second wave of `TS2322`
(an unresolved identifier carries no type predicate, so narrowing that used to work through the raw
`typeof` collapses, and the error count exceeds the number of missing imports) and printed nothing
at all. If the host really does inject these primitives as globals, say so:

```js
createCodeStyleDefaults({ scope: { /* … */ }, helpers: { assumeGlobals: true } })
```

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
