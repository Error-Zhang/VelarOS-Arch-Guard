# Changelog

## 0.2.0 - 2026-07-30

- New optional entrypoint `@velaros-ai/arch-guard/checks/code-style`: 37 language-level
  writing rules (`code-style/*`) covering absence-value expression, single-source type
  guards, early return, table-driven branching, identity forwarders, redundant strict
  comparisons, swallowed errors, React conditional rendering, and team-language comments.
  Nothing is enabled by default; register the checks explicitly.
- `createCodeStyleDefaults()` fans one shared scanning scope out to every rule, so consumers
  declare repository coordinates once. Rules never hard-code directory names.
- `code-style/require-chinese-comments` exempts JSDoc blocks attached to exported
  declarations (public API docs); opt out with `exemptExportedJsDoc: false`.
- The ruleset also re-exports its shared toolkit (`collectCodeStyleFiles`,
  `getCachedSourceFile`, `CodeStyleFixPhase`, …) so downstream plugins can host their own
  project-specific style rules on the same scanning and fix-phase model.

## 0.1.1 - 2026-07-29

- First npm registry release as `@velaros-ai/arch-guard` (previously distributed
  as a tagged Git dependency under the `@velaros/arch-guard` name).
- Scope migration `@velaros/arch-guard` -> `@velaros-ai/arch-guard` across package
  metadata, docs, templates, and tests.
- Normalized the `bin` path to the registry canonical form (no `./` prefix).
- Install documentation now points at the npm registry package.

## 0.1.0 - 2026-07-19

- Initial public release of the architecture policy engine and CLI.
- Typed check and plugin authoring API.
- Diff-aware execution, baselines, reporters, and bounded staged autofix.
- Generic cross-file duplication check.
