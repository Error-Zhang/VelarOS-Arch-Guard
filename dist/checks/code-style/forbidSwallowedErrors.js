import { defineCheck } from '../../core/defineCheck.js';
import ts from 'typescript';
import { collectCodeStyleFiles, getCachedSourceFile, lineOf, walk } from './_shared.js';
import { SilentCatchSuppressionMarkers } from './requireErrorLogging.js';
/**
 * 吞异常门：把"静默吞错"立成计数棘轮（存量入 baseline，看板只降不升）。
 *
 * 覆盖两种 `require-error-logging` 现有守卫够不着的空吞面：
 *   1. **空 catch 块** `catch { }`（body 无语句）——彻底静默。
 *   2. **空 promise catch** `.catch(() => {})` / `.catch(() => undefined)` / `.catch(async () => {})`
 *      / `.catch(function () {})`——`require-error-logging` 只走 `ts.CatchClause`，不走 `.catch()` 调用。
 *
 * 复用同一套内联豁免标记（`SilentCatchSuppressionMarkers`，单源自 requireErrorLogging）：
 * 紧邻处写明原因的注解视为合法 fallback，无注解的才计数。软性门（warning）：不硬拦以免误伤
 * 真·fallback 路径，但存量冻结、新增在 CI 日志可见。
 */
const forbidSwallowedErrors = defineCheck({
    id: 'code-style/forbid-swallowed-errors',
    title: 'Forbid silently swallowed errors (empty catch / empty .catch())',
    description: '空 `catch {}` 与空 `.catch(() => {})` 静默吞错计数棘轮；写明原因的 silent-catch-ok 注解视为合法。',
    verifies: [
        '识别 body 无语句的 `catch { }`。',
        '识别 `.catch(handler)` 且 handler 为空箭头/空函数（body 空块或直接 `undefined`/`void 0`）。',
        '复用 SilentCatchSuppressionMarkers：紧邻处带豁免注解的视为显式豁免，不计数。',
    ],
    tags: ['code-style', 'error-handling'],
    defaultSeverity: 'error',
    run({ context, report }) {
        const section = report.section('Swallowed errors');
        for (const info of collectCodeStyleFiles(context)) {
            const sourceFile = getCachedSourceFile(context, info);
            walk(sourceFile, (node) => {
                if (ts.isCatchClause(node)) {
                    if (node.block.statements.length !== 0)
                        return;
                    if (hasSuppressionMarker(sourceFile, node.parent))
                        return;
                    const line = lineOf(sourceFile, node);
                    section.add({
                        ruleId: 'empty-catch',
                        file: info.relativePath,
                        line,
                        message: `${info.relativePath}:${line}: 空 catch 块静默吞错。请 rethrow / log / 返回 ErrorResult，或加 \`// arch-guard:silent-catch-ok <原因>\` 说明为何静默。`,
                        fingerprintInput: `${info.relativePath}::${line}::empty-catch`,
                    });
                    return;
                }
                if (ts.isCallExpression(node) && isEmptyPromiseCatch(node)) {
                    if (hasSuppressionMarker(sourceFile, enclosingStatement(node) ?? node))
                        return;
                    const line = lineOf(sourceFile, node);
                    section.add({
                        ruleId: 'empty-promise-catch',
                        file: info.relativePath,
                        line,
                        message: `${info.relativePath}:${line}: \`.catch(() => {})\` 空吞 promise rejection。请处理错误，或加 \`// arch-guard:silent-catch-ok <原因>\` 说明为何静默。`,
                        fingerprintInput: `${info.relativePath}::${line}::empty-promise-catch`,
                    });
                }
            });
        }
    },
});
/** `.catch(handler)` 且 handler 是空箭头/空函数。 */
function isEmptyPromiseCatch(call) {
    const callee = call.expression;
    if (!ts.isPropertyAccessExpression(callee) || callee.name.text !== 'catch')
        return false;
    if (call.arguments.length !== 1)
        return false;
    const handler = call.arguments[0];
    if (!handler)
        return false;
    return isEmptyHandler(handler);
}
function isEmptyHandler(node) {
    if (ts.isArrowFunction(node)) {
        const body = node.body;
        if (ts.isBlock(body))
            return body.statements.length === 0;
        return isNoOpExpression(body);
    }
    if (ts.isFunctionExpression(node))
        return node.body.statements.length === 0;
    return false;
}
/** `() => undefined` / `() => void 0` 视为等价空吞。 */
function isNoOpExpression(node) {
    if (ts.isIdentifier(node) && node.text === 'undefined')
        return true;
    if (ts.isVoidExpression(node))
        return true;
    return false;
}
function enclosingStatement(node) {
    let cur = node;
    while (cur) {
        if (ts.isStatement(cur))
            return cur;
        cur = cur.parent;
    }
    return undefined;
}
function hasSuppressionMarker(sourceFile, scope) {
    const text = scope.getText(sourceFile);
    return SilentCatchSuppressionMarkers.some((marker) => text.includes(marker));
}
export { forbidSwallowedErrors };
//# sourceMappingURL=forbidSwallowedErrors.js.map