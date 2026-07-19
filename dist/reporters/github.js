/**
 * GitHub Actions reporter：把每条违规输出成 `::error file=...,line=...::message`
 * 形式，PR 上即可看到行内注释。
 */
const githubReporter = {
    name: 'github',
    report(aggregate) {
        for (const report of aggregate.reports) {
            for (const section of report.failedSections) {
                for (const violation of section.violations) {
                    const command = severityToCommand(violation.severity);
                    const parts = [];
                    if (violation.file)
                        parts.push(`file=${violation.file}`);
                    if (violation.line !== undefined)
                        parts.push(`line=${violation.line}`);
                    if (violation.column !== undefined)
                        parts.push(`col=${violation.column}`);
                    parts.push(`title=${escapeAnnotation(violation.ruleId)}`);
                    const header = `::${command} ${parts.join(',')}::`;
                    const message = escapeAnnotation(violation.message);
                    process.stdout.write(`${header}${message}\n`);
                }
            }
        }
    },
};
function severityToCommand(severity) {
    if (severity === 'error')
        return 'error';
    if (severity === 'warning')
        return 'warning';
    return 'notice';
}
function escapeAnnotation(value) {
    return value.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}
export { githubReporter };
//# sourceMappingURL=github.js.map