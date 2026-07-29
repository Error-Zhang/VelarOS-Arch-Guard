# Changelog

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
