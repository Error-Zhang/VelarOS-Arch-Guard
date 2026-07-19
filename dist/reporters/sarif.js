import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
/**
 * SARIF 2.1.0 reporter，可用于 GitHub Code Scanning 上传。
 *
 * 仅生成最常用的 result/rule/location 结构，足以让 PR diff 出现行内告警。
 */
function sarifReporter(options = {}) {
    return {
        name: 'sarif',
        report(aggregate, context) {
            const ruleIndex = new Map();
            const rules = [];
            const results = [];
            for (const report of aggregate.reports) {
                for (const section of report.failedSections) {
                    for (const violation of section.violations) {
                        if (!ruleIndex.has(violation.ruleId)) {
                            ruleIndex.set(violation.ruleId, rules.length);
                            rules.push({
                                id: violation.ruleId,
                                shortDescription: { text: report.check.title },
                                fullDescription: { text: report.check.description },
                                defaultConfiguration: { level: sarifLevel(violation.severity) },
                            });
                        }
                        const result = {
                            ruleId: violation.ruleId,
                            ruleIndex: ruleIndex.get(violation.ruleId),
                            level: sarifLevel(violation.severity),
                            message: { text: violation.message },
                        };
                        if (violation.file) {
                            result.locations = [
                                {
                                    physicalLocation: {
                                        artifactLocation: { uri: violation.file },
                                        region: violation.line === undefined
                                            ? undefined
                                            : {
                                                startLine: violation.line,
                                                ...(violation.column !== undefined
                                                    ? { startColumn: violation.column }
                                                    : {}),
                                            },
                                    },
                                },
                            ];
                        }
                        if (violation.fingerprint) {
                            result.partialFingerprints = { archGuardFingerprint: violation.fingerprint };
                        }
                        results.push(result);
                    }
                }
            }
            const payload = {
                $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
                version: '2.1.0',
                runs: [
                    {
                        tool: {
                            driver: {
                                name: options.toolName ?? 'arch-guard',
                                version: options.toolVersion ?? '0.1.0',
                                informationUri: options.informationUri ??
                                    'https://github.com/Error-Zhang/VelarOS-Arch-Guard',
                                rules,
                            },
                        },
                        results,
                    },
                ],
            };
            const text = `${JSON.stringify(payload, null, 2)}\n`;
            if (!options.out) {
                process.stdout.write(text);
                return;
            }
            const targetPath = resolve(context.rootDir, options.out);
            mkdirSync(dirname(targetPath), { recursive: true });
            writeFileSync(targetPath, text, 'utf-8');
        },
    };
}
function sarifLevel(severity) {
    if (severity === 'error')
        return 'error';
    if (severity === 'warning')
        return 'warning';
    return 'note';
}
export { sarifReporter };
//# sourceMappingURL=sarif.js.map