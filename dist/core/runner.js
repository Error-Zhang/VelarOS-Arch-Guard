import { resolve } from 'node:path';
import { applyScheduledFixes, collectFixableViolations, resolveFixEnabled } from './applyFixes.js';
import { loadBaselineFile, writeBaselineEntriesFile } from './baseline.js';
import { createSharedContext } from './context.js';
import { buildCheckFilter, passesFilter } from './filter.js';
import { createFixContext } from './fixContext.js';
import { applyInlineSuspendMarkers } from './inlineSuspendMarkers.js';
import { createLogger } from './logger.js';
import { CheckReport, ReportAggregate, resolveSeverityOverride } from './report.js';
/**
 * 主调度函数。
 *
 * 流程：
 *  1. 合并 plugin checks + filter，得到本次要跑的 checks
 *  2. 为每个 check 计算有效 severity（config.rules 覆盖 defaultSeverity）
 *  3. 构造共享 context，串行调用 check.run
 *  4. baseline 过滤、（可选）多轮 applyFix + 复跑、reporter 输出、exitCode 判定
 *
 * 串行执行的理由：单仓库规模下文件 IO 和 AST 解析已经被 SharedCache 复用，
 * 并行带来的复杂度（错误聚合、stdout 顺序）目前不值得引入。后续可加 workerPool。
 */
async function runArchGuard(options) {
    const { config } = options;
    const logger = createLogger(options.logLevel ?? 'warn');
    const filter = buildCheckFilter(options.filter);
    const allChecks = collectAllChecks(config);
    assertCheckIdUniqueness(allChecks);
    const checksToRun = allChecks.filter((check) => {
        const severity = effectiveSeverity(check, config);
        if (severity === 'off')
            return false;
        return passesFilter(check, filter);
    });
    const sharedContext = createSharedContext({
        rootDir: config.rootDir,
        excludeDirNames: config.excludeDirNames,
        fileScope: config.files,
        logger,
    });
    const baselinePath = resolveBaselinePath(config.rootDir, options.baselinePath);
    const baseline = options.ignoreBaseline ? undefined : loadBaselineFile(baselinePath);
    let aggregate = await executeChecksPass({
        checksToRun,
        config,
        sharedContext,
        baseline,
        logger,
    });
    const fixGloballyEnabled = resolveFixEnabled(options.fix, config);
    const maxFixIterations = options.maxFixIterations ?? 25;
    if (fixGloballyEnabled && maxFixIterations > 0) {
        const fixContext = createFixContext(config.rootDir, logger);
        for (let iteration = 0; iteration < maxFixIterations; iteration += 1) {
            const candidates = collectFixableViolations(aggregate, config, fixGloballyEnabled);
            if (candidates.length === 0)
                break;
            const applied = await applyScheduledFixes(candidates, fixContext, logger);
            if (applied === 0)
                break;
            sharedContext.cache.clear();
            aggregate = await executeChecksPass({
                checksToRun,
                config,
                sharedContext,
                baseline,
                logger,
            });
        }
    }
    for (const reporter of options.reporters) {
        await reporter.report(aggregate, { rootDir: config.rootDir });
    }
    if (baseline) {
        // 当 only/skip/tag 过滤启用时，未跑的 check 对应的 baseline 必然 "stale"，
        // 那只是过滤副作用，不是真正的过时条目，因此跳过提示和自动清理。
        const filterActive = isFilterActive(options.filter) || options.fileScopeActive === true;
        if (!filterActive) {
            const staleEntries = baseline.staleEntries;
            if (staleEntries.length > 0 && options.pruneStaleBaseline) {
                writeBaselineEntriesFile(baselinePath, baseline.matchedEntries);
                if (options.warnStaleBaseline ?? true) {
                    logger.warn(`${staleEntries.length} stale baseline entr${staleEntries.length === 1 ? 'y was' : 'ies were'} pruned from ${baselinePath}.`);
                }
            }
            else if (staleEntries.length > 0 && (options.warnStaleBaseline ?? true)) {
                logger.warn(`${staleEntries.length} baseline entr${staleEntries.length === 1 ? 'y is' : 'ies are'} stale (no longer matched). ` +
                    'Run `arch-guard baseline update` to regenerate.');
            }
        }
    }
    return {
        aggregate,
        baseline,
        exitCode: aggregate.hasFailures ? 1 : 0,
    };
}
async function executeChecksPass(input) {
    const { checksToRun, config, sharedContext, baseline, logger } = input;
    const aggregate = new ReportAggregate();
    for (const check of checksToRun) {
        const severity = effectiveSeverity(check, config);
        const report = new CheckReport(check, severity);
        const checkOptions = mergeCheckOptions(check, config);
        const runContext = {
            rootDir: config.rootDir,
            options: checkOptions,
            files: sharedContext.files,
            cache: sharedContext.cache,
            log: logger,
        };
        try {
            await check.run({ context: runContext, report });
        }
        catch (error) {
            report
                .section('Internal error')
                .add({
                ruleId: 'internal-error',
                message: `Check threw: ${error instanceof Error ? error.message : String(error)}`,
            });
            logger.error(`check ${check.id} threw`, error);
        }
        applySuppressedSections(report, config);
        applyInlineSuspendMarkers(report, config.rootDir, sharedContext.cache);
        if (baseline) {
            filterViolationsAgainstBaseline(report, baseline);
        }
        aggregate.add(report);
    }
    return aggregate;
}
function collectAllChecks(config) {
    const fromPlugins = config.plugins.flatMap((plugin) => plugin.checks ?? []);
    return [...config.checks, ...fromPlugins];
}
function isFilterActive(filter) {
    return ((filter?.only?.length ?? 0) > 0 ||
        (filter?.skip?.length ?? 0) > 0 ||
        (filter?.tags?.length ?? 0) > 0);
}
function assertCheckIdUniqueness(checks) {
    const seen = new Map();
    for (const check of checks) {
        if (seen.has(check.id)) {
            throw new Error(`arch-guard: duplicate check id "${check.id}" (titles: ${seen.get(check.id)} / ${check.title}). ` +
                'Each check id must be unique across plugins and config.');
        }
        seen.set(check.id, check.title);
    }
}
function effectiveSeverity(check, config) {
    let fromPluginSeverities;
    for (const plugin of config.plugins) {
        const override = plugin.severities?.[check.id];
        if (override !== undefined) {
            fromPluginSeverities = override;
            break;
        }
    }
    return resolveSeverityOverride(fromPluginSeverities ?? check.defaultSeverity ?? 'error', config.rules?.[check.id]);
}
function mergeCheckOptions(check, config) {
    const fromPluginDefaults = {};
    for (const plugin of config.plugins) {
        const defaults = plugin.defaults?.[check.id];
        if (defaults)
            Object.assign(fromPluginDefaults, defaults);
    }
    const userRule = config.rules?.[check.id];
    const userRuleRecord = typeof userRule === 'object' && userRule !== null ? userRule : null;
    const fromUserOptions = userRuleRecord?.options !== undefined
        ? userRuleRecord.options ?? {}
        : {};
    return Object.freeze({ ...fromPluginDefaults, ...fromUserOptions });
}
function applySuppressedSections(report, config) {
    const override = config.rules?.[report.check.id];
    if (typeof override !== 'object' || override === null)
        return;
    const suppressed = override.suppressSections;
    if (!Array.isArray(suppressed) || suppressed.length === 0)
        return;
    const suppressedSet = new Set(suppressed);
    for (const title of [...report.sections.keys()]) {
        if (suppressedSet.has(title)) {
            report.sections.delete(title);
        }
    }
}
function filterViolationsAgainstBaseline(report, baseline) {
    for (const section of report.sections.values()) {
        let writeIndex = 0;
        for (let readIndex = 0; readIndex < section.violations.length; readIndex += 1) {
            const violation = section.violations[readIndex];
            if (baseline.isWaived(violation))
                continue;
            section.violations[writeIndex] = violation;
            writeIndex += 1;
        }
        section.violations.length = writeIndex;
    }
}
function resolveBaselinePath(rootDir, override) {
    if (override)
        return resolve(rootDir, override);
    return resolve(rootDir, '.arch-guard/baseline.json');
}
export { collectAllChecks, effectiveSeverity, resolveBaselinePath, runArchGuard };
//# sourceMappingURL=runner.js.map