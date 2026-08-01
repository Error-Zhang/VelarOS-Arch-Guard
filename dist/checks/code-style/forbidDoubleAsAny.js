import { defineCheck } from '../../core/defineCheck.js';
import ts from 'typescript';
import { collectCodeStyleFiles, getCachedSourceFile, lineOf, snippetOf, walk } from './_shared.js';
/**
 * 历史 opt-in 规则：禁止把 any 当跳板的双重断言。
 *
 * VelarOS 默认 code-style checks 不再注册本规则：动态边界、第三方库、测试替身等场景可以直接用 any，
 * 不再强迫通过 unknown 做双重断言。若某个子项目想重新收紧，可显式启用这条 legacy check。
 */
const forbidDoubleAsAny = defineCheck({
    id: 'code-style/forbid-double-as-any',
    title: 'Legacy opt-in: forbid double-as-any assertions',
    description: '历史 opt-in 规则：禁止 double-as-any 断言；VelarOS 默认 checks 不启用，动态边界可直接用 any。',
    verifies: ['识别 double-as-any 形态并报告。'],
    tags: ['code-style', 'type-safety'],
    defaultSeverity: 'error',
    run({ context, report }) {
        const section = report.section('Unsafe any assertions');
        for (const info of collectCodeStyleFiles(context)) {
            const sourceFile = getCachedSourceFile(context, info);
            walk(sourceFile, (node) => {
                if (!ts.isAsExpression(node))
                    return;
                if (!ts.isAsExpression(node.expression))
                    return;
                if (node.expression.type.kind !== ts.SyntaxKind.AnyKeyword)
                    return;
                const line = lineOf(sourceFile, node);
                section.add({
                    ruleId: 'double-as-any',
                    file: info.relativePath,
                    line,
                    message: `${info.relativePath}:${line}: "${snippetOf(sourceFile, node)}" uses double-as-any. This legacy opt-in rule is disabled in VelarOS default checks; if enabled locally, replace the cast with a narrow boundary helper.`,
                    fingerprintInput: `${info.relativePath}::${line}::double-as-any`,
                    suggestion: 'Keep double-as-any only at true dynamic boundaries; otherwise introduce a typed boundary helper.',
                });
            });
        }
    },
});
export { forbidDoubleAsAny };
//# sourceMappingURL=forbidDoubleAsAny.js.map