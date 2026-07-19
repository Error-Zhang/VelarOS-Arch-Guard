import { readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { writeFileAtomically } from '../utils/atomicWrite.js';
function createFixContext(rootDir, log) {
    const absoluteRoot = resolve(rootDir);
    return {
        rootDir: absoluteRoot,
        log,
        resolveFile(relativePosix) {
            return resolveWithinRoot(absoluteRoot, relativePosix);
        },
        readTextFile(relativePosix) {
            return readFileSync(resolveWithinRoot(absoluteRoot, relativePosix), 'utf-8');
        },
        writeTextFile(relativePosix, content) {
            writeFileAtomically(resolveWithinRoot(absoluteRoot, relativePosix), content);
        },
        replaceTextRange(relativePosix, range, replacement, options = {}) {
            const targetPath = resolveWithinRoot(absoluteRoot, relativePosix);
            const text = readFileSync(targetPath, 'utf-8');
            const start = clampOffset(range.start, text.length);
            const end = clampOffset(range.end, text.length);
            const orderedStart = Math.min(start, end);
            const orderedEnd = Math.max(start, end);
            const original = text.slice(orderedStart, orderedEnd);
            const nextReplacement = options.preserveLeadingTrivia === false
                ? replacement
                : withPreservedLeadingTrivia(original, replacement);
            writeFileAtomically(targetPath, `${text.slice(0, orderedStart)}${nextReplacement}${text.slice(orderedEnd)}`);
        },
    };
}
function resolveWithinRoot(rootDir, relativePath) {
    const targetPath = resolve(rootDir, relativePath);
    const relation = relative(rootDir, targetPath);
    if (relation === '..' || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
        throw new Error(`arch-guard: autofix path escapes rootDir: ${relativePath}`);
    }
    return targetPath;
}
function clampOffset(offset, max) {
    if (!Number.isFinite(offset))
        return 0;
    return Math.max(0, Math.min(Math.trunc(offset), max));
}
function withPreservedLeadingTrivia(original, replacement) {
    if (!replacement)
        return replacement;
    const leadingTrivia = readLeadingTrivia(original);
    if (!leadingTrivia)
        return replacement;
    return `${leadingTrivia}${replacement.trimStart()}`;
}
function readLeadingTrivia(text) {
    let index = 0;
    while (index < text.length) {
        const next = readNextTrivia(text, index);
        if (next === index) {
            break;
        }
        index = next;
    }
    return text.slice(0, index);
}
function readNextTrivia(text, index) {
    let cursor = index;
    while (cursor < text.length && /\s/.test(text[cursor] ?? '')) {
        cursor += 1;
    }
    if (cursor > index)
        return cursor;
    if (text.startsWith('//', index)) {
        const newline = text.indexOf('\n', index + 2);
        return newline === -1 ? text.length : newline + 1;
    }
    if (text.startsWith('/*', index)) {
        const close = text.indexOf('*/', index + 2);
        return close === -1 ? text.length : close + 2;
    }
    return index;
}
export { createFixContext };
//# sourceMappingURL=fixContext.js.map