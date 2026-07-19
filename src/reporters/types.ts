import type { ReportAggregate } from '../core/report'

interface ReporterContext {
  rootDir: string
}

interface Reporter {
  name: string
  report(aggregate: ReportAggregate, context: ReporterContext): void | Promise<void>
}

export type { Reporter, ReporterContext }
