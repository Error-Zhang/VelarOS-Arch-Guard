import type { CheckReport } from '../core/report'
import type { SeverityLevel } from '../core/severity'

import type { Reporter } from './types'

/**
 * 默认终端 reporter：按 check + section 分组打印，便于人类阅读。
 *
 * 输出无颜色（保持 CI 日志干净），如需高亮可在 CLI 外层套 chalk。
 */
const stylishReporter: Reporter = {
  name: 'stylish',
  report(aggregate) {
    if (!aggregate.hasFailures && aggregate.allViolations.length === 0) {
      const { totalChecks } = aggregate.summary()
      console.info(`arch-guard: ${totalChecks} checks passed.`)
      return
    }

    for (const report of aggregate.reports) {
      if (!report.hasViolations) continue
      printReportHeader(report)
      for (const section of report.failedSections) {
        console.info(`  ${section.title}:`)
        for (const violation of section.violations) {
          const tag = severityTag(violation.severity)
          console.info(`    ${tag} ${violation.message}`)
          if (violation.suggestion && violation.suggestion !== violation.message) {
            console.info(`        → ${violation.suggestion}`)
          }
        }
        console.info('')
      }
    }

    const { totalViolations, errors, warnings, infos, failingChecks } = aggregate.summary()
    console.info(
      `arch-guard: ${totalViolations} violation(s) — ${errors} error(s), ${warnings} warning(s), ${infos} info, ${failingChecks} failing check(s).`
    )
  },
}

function printReportHeader(report: CheckReport): void {
  console.info('')
  // 仅 error 级别 check 用 ✖；warning/info 等非阻断违规用较轻标记，避免与失败混淆。
  const failingMark = report.hasFailures ? '✖' : '·'
  console.info(`${failingMark} ${report.check.title} [${report.check.id}]`)
  console.info(`  ${report.check.description}`)
}

function severityTag(severity: SeverityLevel): string {
  switch (severity) {
    case 'error':
      return '[error]'
    case 'warning':
      return '[warn]'
    case 'info':
      return '[info]'
    case 'off':
      return '[off]'
  }
}

export { stylishReporter }
