# Contributing

Issues and focused pull requests are welcome.

## Boundary

The public engine accepts behavior that is useful across unrelated JavaScript or TypeScript repositories. Product paths, organization-specific package names, framework policy, and one-repository conventions belong in a separate plugin.

New public API should fit one of the documented entrypoints. Do not import an internal `dist/*` or `src/*` path from tests, examples, or plugins.

## Development

```bash
npm install
npm run check
```

Every behavior change should include a Node test. Autofix changes must cover both the intended rewrite and the unchanged surrounding text. CLI changes should test exit codes and filesystem effects in a temporary directory.

Commits should be narrowly scoped and must not include generated credentials, private baselines, or host-project policy.
