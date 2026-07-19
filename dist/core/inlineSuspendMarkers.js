/**
 * arch-guard 专有行内「暂缓」标记（与 ESLint / TypeScript suppress 区分开）。
 *
 * 语法见公共 README 的 "Temporary suppressions" 小节。
 */
import { resolve } from 'node:path';
/** 单行/邻近行：暂缓指定 check 或 rule 在某个位置的报告。 */
const ARCH_GUARD_SUSPEND_LINE = '@arch-guard:suspend';
/** 文件头：暂缓整个文件内某 check 的报告（仅扫描文件前若干行）。 */
const ARCH_GUARD_SUSPEND_FILE = '@arch-guard:suspend-file';
/** 通配暂缓（同一行邻近标记）：仅在「理由」足够长时使用。 */
const ARCH_GUARD_SUSPEND_ALL = '*';
const FILE_HEAD_SCAN_LINES = 120;
const LINE_MARKER_LOOKBACK = 36;
const LINE_SUSPEND_REASON_MIN = 8;
const WILDCARD_REASON_MIN = 24;
function splitReasonPayload(rest) {
    const idxEnglish = rest.indexOf('Reason:');
    if (idxEnglish >= 0)
        return {
            scopesPart: rest.slice(0, idxEnglish).trim(),
            reason: rest.slice(idxEnglish + 'Reason:'.length).trim(),
        };
    const idxCn = rest.indexOf('理由：');
    if (idxCn >= 0)
        return {
            scopesPart: rest.slice(0, idxCn).trim(),
            reason: rest.slice(idxCn + '理由：'.length).trim(),
        };
    const idxAscii = rest.indexOf('理由:');
    if (idxAscii >= 0)
        return {
            scopesPart: rest.slice(0, idxAscii).trim(),
            reason: rest.slice(idxAscii + '理由:'.length).trim(),
        };
    return null;
}
function reasonLenOk(reason, scopes) {
    const n = [...reason].length;
    if (scopes.includes(ARCH_GUARD_SUSPEND_ALL))
        return n >= WILDCARD_REASON_MIN;
    return n >= LINE_SUSPEND_REASON_MIN;
}
function parseSuspendBody(body, fileScope) {
    const split = splitReasonPayload(body.trim());
    if (!split || split.reason.length === 0)
        return null;
    const scopes = split.scopesPart
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    if (scopes.length === 0)
        return null;
    if (fileScope && scopes.includes(ARCH_GUARD_SUSPEND_ALL))
        return null;
    if (!reasonLenOk(split.reason, scopes))
        return null;
    return { scopes, reason: split.reason, fileScope };
}
function tryParseSuspendFromCommentSlice(comment, fileScope) {
    const token = fileScope ? ARCH_GUARD_SUSPEND_FILE : ARCH_GUARD_SUSPEND_LINE;
    const idx = comment.indexOf(token);
    if (idx < 0)
        return null;
    const after = comment.slice(idx + token.length).trimStart();
    if (after.length === 0)
        return null;
    return parseSuspendBody(after, fileScope);
}
/** 从一物理行中提取双斜杠注释与单行块注释中的暂缓声明。 */
function collectSuspendsFromSourceLine(rawLine) {
    const results = [];
    const slashSlash = rawLine.indexOf('//');
    if (slashSlash >= 0) {
        const commentText = rawLine.slice(slashSlash + 2);
        const fileSus = tryParseSuspendFromCommentSlice(commentText, true);
        if (fileSus)
            results.push(fileSus);
        const lineSus = tryParseSuspendFromCommentSlice(commentText, false);
        if (lineSus)
            results.push(lineSus);
    }
    const blockSingle = rawLine.match(/\/\*\s*([\s\S]*?)\*\//);
    if (blockSingle?.[1]) {
        const inner = blockSingle[1].trim();
        const fileSus = tryParseSuspendFromCommentSlice(inner, true);
        if (fileSus)
            results.push(fileSus);
        const lineSus = tryParseSuspendFromCommentSlice(inner, false);
        if (lineSus)
            results.push(lineSus);
    }
    return results;
}
function scopeMatchesViolation(scope, violation) {
    if (scope === ARCH_GUARD_SUSPEND_ALL)
        return true;
    const ruleCompound = violation.ruleId;
    if (scope.startsWith('rule:')) {
        const suffix = scope.slice('rule:'.length);
        return ruleCompound === suffix || ruleCompound.endsWith(`/${suffix}`);
    }
    return violation.checkId === scope;
}
function suspendCoversViolation(parsed, violation) {
    return parsed.scopes.some((s) => scopeMatchesViolation(s, violation));
}
/** 行 L 为 1-based。 */
function parseLineScopesSuspends(lines, lineOneBased) {
    const out = [];
    const start = Math.max(0, lineOneBased - LINE_MARKER_LOOKBACK);
    const end = Math.min(lines.length - 1, lineOneBased - 1);
    for (let i = start; i <= end; i += 1) {
        const line = lines[i];
        if (line === undefined)
            continue;
        for (const p of collectSuspendsFromSourceLine(line)) {
            if (p.fileScope)
                continue;
            out.push(p);
        }
    }
    return out;
}
function parseFileHeadFileSuspends(lines) {
    const limit = Math.min(lines.length, FILE_HEAD_SCAN_LINES);
    const head = [];
    for (let i = 0; i < limit; i += 1) {
        const line = lines[i];
        if (line === undefined)
            continue;
        for (const p of collectSuspendsFromSourceLine(line)) {
            if (!p.fileScope)
                continue;
            head.push(p);
        }
    }
    return head;
}
function violationHasInlineSuspend(violation, cache, rootDir) {
    if (!violation.file)
        return false;
    const absPath = resolve(rootDir, violation.file);
    let text;
    try {
        text = cache.readSource(absPath);
    }
    catch {
        return false;
    }
    const lines = text.split(/\r?\n/);
    for (const p of parseFileHeadFileSuspends(lines)) {
        if (suspendCoversViolation(p, violation))
            return true;
    }
    const lineNum = violation.line;
    if (lineNum !== undefined && lineNum >= 1) {
        for (const p of parseLineScopesSuspends(lines, lineNum)) {
            if (suspendCoversViolation(p, violation))
                return true;
        }
    }
    return false;
}
/**
 * 在 baseline 过滤前调用：删掉被 `@arch-guard:suspend*` 合规覆盖的违规。
 */
function applyInlineSuspendMarkers(report, rootDir, cache) {
    for (const section of report.sections.values()) {
        let writeIndex = 0;
        for (let readIndex = 0; readIndex < section.violations.length; readIndex += 1) {
            const v = section.violations[readIndex];
            if (violationHasInlineSuspend(v, cache, rootDir)) {
                continue;
            }
            section.violations[writeIndex] = v;
            writeIndex += 1;
        }
        section.violations.length = writeIndex;
    }
}
export { applyInlineSuspendMarkers, ARCH_GUARD_SUSPEND_ALL, ARCH_GUARD_SUSPEND_FILE, ARCH_GUARD_SUSPEND_LINE, };
//# sourceMappingURL=inlineSuspendMarkers.js.map