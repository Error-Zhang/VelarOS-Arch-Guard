import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { posix, relative, resolve } from 'node:path';
import { isAbsoluteLikePath, normalizePathSeparators } from '../utils/paths.js';
import { toBoolean, toString, toStringArray } from './argv.js';
const SupportedFileExtensions = new Set(['.ts', '.tsx', '.js', '.mjs']);
const AllConfiguredRoots = '<arch-guard:all-configured-roots>';
function applyCliFileScope(config, args) {
    const files = collectCliFileScopeFiles(config.rootDir, args);
    if (files.length === 0)
        return {
            config,
            active: false,
            files: [],
        };
    const includePatterns = files.flatMap((path) => fileScopePatternsFor(config.rootDir, path));
    const roots = narrowScopeRoots(config.files?.roots, files.flatMap((path) => fileScopeRootsFor(config.rootDir, path)));
    return {
        config: {
            ...config,
            files: {
                ...config.files,
                roots: Object.freeze(roots),
                includePatterns: Object.freeze([
                    ...(config.files?.includePatterns ?? []),
                    ...includePatterns,
                ]),
            },
        },
        active: true,
        files,
    };
}
function collectCliFileScopeFiles(rootDir, args) {
    const explicit = [...args.positionals, ...toStringArray(args.options.file)];
    const fromExplicit = explicit.flatMap((entry) => normalizeFileScopeInput(rootDir, entry));
    const wantsChanged = toBoolean(args.options.changed) || toBoolean(args.options.diff);
    const fromChanged = wantsChanged ? collectChangedFiles(rootDir, args) : [];
    const fromStaged = toBoolean(args.options.staged) ? collectStagedFiles(rootDir) : [];
    return unique([...fromExplicit, ...fromChanged, ...fromStaged]).filter((file) => isSupportedSourcePath(file));
}
function normalizeFileScopeInput(rootDir, entry) {
    const normalized = normalizeFileScopePath(rootDir, entry);
    if (!normalized)
        return [];
    if (looksLikeGlob(normalized))
        return [normalized];
    const absolute = resolve(rootDir, normalized);
    if (!existsSync(absolute))
        return [normalized];
    const stats = statSync(absolute);
    if (stats.isDirectory())
        return [stripTrailingSlash(normalized)];
    return [normalized];
}
function collectChangedFiles(rootDir, args) {
    const base = toString(args.options.base);
    if (base)
        return gitLines(rootDir, ['diff', '--name-only', base, '--']);
    return unique([
        ...collectStagedFiles(rootDir),
        ...gitLines(rootDir, ['diff', '--name-only', '--']),
        ...gitLines(rootDir, ['ls-files', '--others', '--exclude-standard']),
    ]);
}
function collectStagedFiles(rootDir) {
    return gitLines(rootDir, ['diff', '--name-only', '--cached', '--']);
}
function gitLines(rootDir, args) {
    const result = spawnSync('git', args, {
        cwd: rootDir,
        encoding: 'utf-8',
    });
    if (result.status !== 0)
        return [];
    return result.stdout
        .split('\n')
        .map((line) => normalizeFileScopePath(rootDir, line))
        .filter(Boolean);
}
function fileScopePatternsFor(rootDir, path) {
    const normalized = stripTrailingSlash(normalizeFileScopePath(rootDir, path));
    if (!normalized)
        return [];
    if (looksLikeGlob(normalized))
        return [normalized];
    const absoluteCandidate = resolve(rootDir, normalized);
    if (existsSync(absoluteCandidate) && statSync(absoluteCandidate).isDirectory()) {
        if (normalized === '.')
            return ['**/*'];
        return [`${normalized}/**`];
    }
    if (!isSupportedSourcePath(normalized) && !normalized.includes('.'))
        return [`${normalized}/**`];
    return [normalized];
}
function fileScopeRootsFor(rootDir, path) {
    const normalized = stripTrailingSlash(normalizeFileScopePath(rootDir, path));
    if (!normalized)
        return [];
    if (looksLikeGlob(normalized))
        return [staticRootForGlob(normalized)];
    const absoluteCandidate = resolve(rootDir, normalized);
    if (existsSync(absoluteCandidate) && statSync(absoluteCandidate).isDirectory()) {
        if (normalized === '.')
            return [AllConfiguredRoots];
        return [normalized];
    }
    if (!isSupportedSourcePath(normalized) && !normalized.includes('.'))
        return [normalized];
    const directory = posix.dirname(normalized);
    return [normalizeScopeRoot(directory)];
}
function narrowScopeRoots(configuredRoots, scopeRoots) {
    const configured = normalizeRootList(configuredRoots && configuredRoots.length > 0 ? configuredRoots : ['.']);
    const scoped = normalizeRootList(scopeRoots);
    const result = new Set();
    for (const scope of scoped) {
        if (scope === AllConfiguredRoots) {
            for (const configuredRoot of configured) {
                result.add(configuredRoot);
            }
            continue;
        }
        for (const configuredRoot of configured) {
            if (scope === '.' && configuredRoot !== '.')
                continue;
            if (isPathWithin(scope, configuredRoot)) {
                result.add(scope);
            }
            else if (isPathWithin(configuredRoot, scope)) {
                result.add(configuredRoot);
            }
        }
    }
    return [...result];
}
function isSupportedSourcePath(path) {
    if (looksLikeGlob(path))
        return true;
    if (!path.includes('.'))
        return true;
    return [...SupportedFileExtensions].some((extension) => path.endsWith(extension));
}
function normalizeFileScopePath(rootDir, path) {
    const trimmed = path.trim();
    if (!trimmed)
        return '';
    const normalized = trimmed.replaceAll('\\', '/').replace(/^\.\/+/, '');
    if (normalized === '.')
        return '.';
    if (looksLikeGlob(normalized))
        return stripTrailingSlash(normalized);
    const absolutePath = isAbsoluteLikePath(trimmed) ? trimmed : resolve(rootDir, trimmed);
    return normalizePathSeparators(relative(rootDir, absolutePath)).replace(/^\.\/+/, '');
}
function normalizeRootList(roots) {
    return unique(roots.map(normalizeScopeRoot));
}
function normalizeScopeRoot(root) {
    const normalized = stripTrailingSlash(root.replaceAll('\\', '/').replace(/^\.\/+/, ''));
    return normalized || '.';
}
function staticRootForGlob(path) {
    const segments = path.split('/');
    const firstGlobIndex = segments.findIndex((segment) => looksLikeGlob(segment));
    const stableSegments = firstGlobIndex === -1 ? segments : segments.slice(0, firstGlobIndex);
    const root = normalizeScopeRoot(stableSegments.join('/'));
    return root === '.' ? AllConfiguredRoots : root;
}
function isPathWithin(candidate, parent) {
    if (parent === '.')
        return true;
    return candidate === parent || candidate.startsWith(`${parent}/`);
}
function stripTrailingSlash(path) {
    return path.replace(/\/+$/, '');
}
function looksLikeGlob(path) {
    return /[*?[\]{}]/.test(path);
}
function unique(values) {
    return [...new Set(values.filter(Boolean))];
}
export { applyCliFileScope };
//# sourceMappingURL=fileScope.js.map