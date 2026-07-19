import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import type { Reporter } from './types'

interface JsonReporterOptions {
  /** 写出文件路径（相对 rootDir 或绝对路径），不传时打印到 stdout。 */
  out?: string
}

/** JSON reporter，便于 CI / IDE / 其它工具消费。 */
function jsonReporter(options: JsonReporterOptions = {}): Reporter {
  return {
    name: 'json',
    report(aggregate, context) {
      const payload = {
        summary: aggregate.summary(),
        reports: aggregate.reports.map((report) => ({
          checkId: report.check.id,
          title: report.check.title,
          description: report.check.description,
          severity: report.effectiveSeverity,
          hasFailures: report.hasFailures,
          sections: report.failedSections.map((section) => ({
            title: section.title,
            violations: section.violations,
          })),
        })),
      }
      const text = `${JSON.stringify(payload, null, 2)}\n`
      if (!options.out) {
        process.stdout.write(text)
        return
      }
      const targetPath = resolve(context.rootDir, options.out)
      mkdirSync(dirname(targetPath), { recursive: true })
      writeFileSync(targetPath, text, 'utf-8')
    },
  }
}

export { jsonReporter }
export type { JsonReporterOptions }
