import { defineCheck } from '../../core/defineCheck.js';
import { toRelativePosix } from '../../utils/paths.js';
import { shortHash, stripCodeComments } from '../../utils/text.js';
import { collectSourceFilesForCheck } from '../_helpers.js';
const DefaultWindowSize = 12;
const DefaultMinLineLength = 24;
const DefaultIgnorePatterns = [
    /^\s*import\b/,
    /^\s*export\s+\{/,
    /^\s*export\s+\*/,
    /^\s*\}\s*$/,
    /^\s*\)\s*$/,
    /^\s*\]\s*$/,
    /^\s*\(\s*$/,
    /^\s*\{\s*$/,
    /^\s*\[\s*$/,
    /^\s*$/,
];
/**
 * 通用规则：跨文件大段重复实现检测。
 *
 * 朴素算法：对每个文件做"剥注释 → 过滤低信息行 → 行序列窗口 hash"，
 * 同一 hash 跨文件出现 ≥2 次即视为可疑重复。
 *
 * options:
 *   - `windowSize`: 滑窗行数，默认 12。
 *   - `minLineLength`: 单行最少非空字符数，默认 24，过滤格式化噪声。
 *   - `include` / `exclude` / `roots` / `extensions`: 标准过滤；测试目录默认会被排除。
 *   - `excludeFilePatterns`: 额外按 regex 排除文件路径。
 */
const crossFileDuplication = defineCheck({
    id: 'duplication/cross-file',
    title: 'Cross-file duplication',
    description: 'Finds substantial implementation blocks repeated across multiple files.',
    verifies: [
        'The same code window (12 lines by default) does not appear in multiple files.',
        'Imports, low-information lines, and test directories are ignored by default.',
        'Every duplicate reports all matching file and line locations.',
    ],
    tags: ['duplication'],
    defaultSeverity: 'warning',
    run({ context, report }) {
        const windowSize = typeof context.options.windowSize === 'number' && context.options.windowSize > 1
            ? (context.options.windowSize)
            : DefaultWindowSize;
        const minLineLength = typeof context.options.minLineLength === 'number' && context.options.minLineLength >= 0
            ? (context.options.minLineLength)
            : DefaultMinLineLength;
        const excludeFilePatterns = parseRegexList(context.options.excludeFilePatterns);
        const files = collectSourceFilesForCheck(context, {
            roots: context.options.roots,
            extensions: context.options.extensions,
            include: context.options.include,
            exclude: context.options.exclude,
        }).filter((file) => !excludeFilePatterns.some((pattern) => pattern.test(file)));
        const windowOccurrences = new Map();
        for (const file of files) {
            const source = stripCodeComments(context.cache.readSource(file));
            const lines = source.split('\n');
            const significant = [];
            for (let i = 0; i < lines.length; i += 1) {
                const text = lines[i] ?? '';
                const trimmed = text.trim();
                if (trimmed.length < minLineLength)
                    continue;
                if (DefaultIgnorePatterns.some((pattern) => pattern.test(text)))
                    continue;
                significant.push({ text: trimmed, line: i + 1 });
            }
            if (significant.length < windowSize)
                continue;
            for (let i = 0; i <= significant.length - windowSize; i += 1) {
                const window = significant.slice(i, i + windowSize).map((entry) => entry.text);
                const hash = shortHash(window.join('\n'), 16);
                const occurrences = windowOccurrences.get(hash) ?? [];
                const firstEntry = significant[i];
                if (!firstEntry)
                    continue;
                occurrences.push({ file, line: firstEntry.line });
                windowOccurrences.set(hash, occurrences);
            }
        }
        const section = report.section('Cross-file duplication windows');
        for (const [hash, occurrences] of windowOccurrences) {
            const files = new Set(occurrences.map((o) => o.file));
            if (files.size < 2)
                continue;
            const positions = occurrences
                .map((o) => `${toRelativePosix(context.rootDir, o.file)}:${o.line}`)
                .sort();
            section.add({
                ruleId: 'duplicate-block',
                message: `Duplicate ${windowSize}-line block found at:\n  - ${positions.join('\n  - ')}`,
                fingerprintInput: `${hash}::${positions.join('|')}`,
            });
        }
    },
});
function parseRegexList(value) {
    if (!Array.isArray(value))
        return [];
    const result = [];
    for (const item of value) {
        if (item instanceof RegExp)
            result.push(item);
        else if (typeof item === 'string')
            result.push(new RegExp(item));
    }
    return result;
}
export { crossFileDuplication };
//# sourceMappingURL=crossFileDuplication.js.map