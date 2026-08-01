import picomatch from 'picomatch';
import { loadConfig } from '../../config/loadConfig.js';
import { Baseline, baselineEntryFromViolation, collapseEntriesByWaiverKey, contentDigestForMessage, entryWaiverCount, keyFromBaselineEntry, readBaselineEntries, waiverKeyFromBaselineEntry, writeBaselineEntriesFile, } from '../../core/baseline.js';
import { buildCheckFilter, passesFilter } from '../../core/filter.js';
import { collectAllChecks, effectiveSeverity, isFilterActive, resolveBaselinePath, runArchGuard, } from '../../core/runner.js';
import { violationKey } from '../../core/violation.js';
import { stylishReporter } from '../../reporters/stylish.js';
import { toBoolean, toString, toStringArray } from '../argv.js';
import { applyCliFileScope, describeEmptyFileScope } from '../fileScope.js';
/**
 * `arch-guard baseline <action>`：棘轮文件的**唯一**写入口。
 *
 *   update   — 重冻违规。**支持作用域**（`--file` / `--changed` / `--staged` / `--only` / `--skip` / `--tag`）：
 *              只重写作用域内的条目，域外条目原样保留。不带作用域 = 全仓重冻（会把别处的新债一起冻进来，
 *              所以现在会把新增条目逐条打出来）。
 *   prune    — 只退役 stale 条目（本次 run 没被命中的），不新增。取代 `run` 的隐式回写。
 *   migrate  — 给存量条目补 `contentDigest`（第二道身份），顺带体检出 fingerprint 撞车。
 *   check    — 只校验，不写盘。
 *
 * 公共 flag：`--dry-run` 一律只打印不写盘。
 */
const BaselineActions = new Set(['update', 'prune', 'migrate', 'check']);
async function baselineCommand(args) {
    const first = args.positionals[0];
    // 裸 `arch-guard baseline` 不许有默认动作。0.2.0 打用法并 exit 2，而「省略即 update」会让
    // 用来发现子命令的那个词**重写整条棘轮**——一个以「只读命令不许改棘轮」为题的版本，
    // 不能自己新增一个隐式写盘默认。
    if (first === undefined || !BaselineActions.has(first)) {
        console.error('Usage: arch-guard baseline <update|prune|migrate|check>');
        return 2;
    }
    const action = first;
    // 动作词本身不是文件作用域实参——剩下的裸 positional 才是（与 `run` 同口径）。
    const rest = { ...args, positionals: args.positionals.slice(1) };
    switch (action) {
        case 'prune':
            return baselinePrune(rest);
        case 'migrate':
            return baselineMigrate(rest);
        case 'check':
            return baselineCheck(rest);
        default:
            return baselineUpdate(rest);
    }
}
async function loadBaselineCommandContext(args) {
    const config = await loadConfig({
        configPath: toString(args.options.config),
        rootDir: toString(args.options.root),
    });
    const fileScope = applyCliFileScope(config, args);
    return {
        config,
        scopedConfig: fileScope.config,
        baselinePath: toString(args.options['baseline-path']) ?? resolveBaselinePath(config.rootDir),
        filter: {
            only: toStringArray(args.options.only),
            skip: toStringArray(args.options.skip),
            tags: toStringArray(args.options.tag),
        },
        fileScopeActive: fileScope.active,
        emptyScopeNotice: describeEmptyFileScope(fileScope),
        scopeFiles: fileScope.files,
        dryRun: toBoolean(args.options['dry-run']),
        reporters: [{ name: 'silent', report() { } }],
    };
}
/**
 * 「要求了作用域但它是空的」——写盘命令一律在这里停住。
 *
 * `--changed` 的 diff 里没有 `.ts/.tsx/.js/.mjs` 时作用域就是空的（改的全是 `.md` / `.json` /
 * 锁文件很常见）。旧实现在这里回落成**全仓重冻**，还打印「下次用 `--file` / `--changed`
 * 限定作用域」——而用户刚刚传的就是 `--changed`。空作用域的正解是什么都不做。
 */
function refuseEmptyScope(ctx, action) {
    if (ctx.emptyScopeNotice === undefined)
        return false;
    console.info(`arch-guard: ${ctx.emptyScopeNotice}. \`baseline ${action}\` did nothing; ` +
        `${ctx.baselinePath} was not touched.`);
    return true;
}
/**
 * 写入面**真的**比全仓小吗？
 *
 * `--file` / `--changed` / `--staged` 收窄文件轴；`--only` / `--tag` 把 check 轴收窄到一份
 * **点名**的子集——两者都答得出「小在哪」。
 *
 * `--skip X` 答不出：它说的是「除了 X」，也就是**其余每一条 check 都在作用域内**，
 * 于是 `baseline update --skip X` 是不折不扣的全仓重冻，却打印安抚性的 `(scoped)`，
 * 顺带吞掉「无作用域重冻会把你没写的债一起冻进来」那句警告。与上一轮修掉的 `--changed`
 * 静默退化是同一个形状：**「用户给了参数」不等于「作用域收窄了」**。
 */
function isScopeNarrowed(ctx) {
    if (ctx.fileScopeActive)
        return true;
    return (ctx.filter.only?.length ?? 0) > 0 || (ctx.filter.tags?.length ?? 0) > 0;
}
/** 把「这次到底冻了哪一片」讲成一句人话，取代 scoped / whole-repository 的二选一。 */
function describeUpdateScope(ctx, narrowed) {
    const skip = ctx.filter.skip ?? [];
    if (!narrowed) {
        return skip.length > 0
            ? `whole repository, minus --skip ${skip.join(',')}`
            : 'whole repository';
    }
    const parts = [];
    if (ctx.fileScopeActive) {
        parts.push(`${ctx.scopeFiles.length} path${ctx.scopeFiles.length === 1 ? '' : 's'}`);
    }
    const only = ctx.filter.only ?? [];
    const tags = ctx.filter.tags ?? [];
    if (only.length > 0)
        parts.push(`--only ${only.join(',')}`);
    if (tags.length > 0)
        parts.push(`--tag ${tags.join(',')}`);
    if (skip.length > 0)
        parts.push(`minus --skip ${skip.join(',')}`);
    return `scoped to ${parts.join(' + ')}`;
}
/**
 * `baseline update`：重冻当前违规。
 *
 * **作用域即合并**：带 `--file` / `--only` 等时，只有落在作用域内的旧条目会被替换，域外条目原样保留。
 * 这就是「一批人只退役自己真修掉的条目」——不带作用域的全仓重冻会把并行实例正在制造的真新债
 * 静默冻进基线，那是 0.2.x 唯一的官方修复入口带来的钝器效应。
 */
async function baselineUpdate(args) {
    const ctx = await loadBaselineCommandContext(args);
    if (refuseEmptyScope(ctx, 'update'))
        return 0;
    // 两个问题，两个答案。**合并**（域外条目要不要原样留着）只要有任何过滤器就必须开——否则
    // `--skip X` 会把 X 的条目当 stale 删掉。**收窄**（这次是不是真的只动了一小片）另算：
    // 见 isScopeNarrowed。把两者挤进同一个 `scoped` 变量，正是 `--skip` 打印 `(scoped)` 的来源。
    const mergeScoped = ctx.fileScopeActive || isFilterActive(ctx.filter);
    const narrowed = isScopeNarrowed(ctx);
    const result = await runArchGuard({
        config: ctx.scopedConfig,
        filter: ctx.filter,
        reporters: ctx.reporters,
        ignoreBaseline: true,
        baselinePath: ctx.baselinePath,
        warnStaleBaseline: false,
        fix: false,
        fileScopeActive: ctx.fileScopeActive,
    });
    const existing = readBaselineEntries(ctx.baselinePath);
    // 收窄扫描面 ≠ 收窄违规列表：不读文件扫描面的 check（docs 索引、package.json 契约、i18n、
    // 遗留 .mjs 巨石）照样报全量违规。只过滤 `existing` 而把**全量** observed 冻进去，
    // 等于用治洞③的药重新打开洞③——并行实例刚写的域外新债会被一起冻住，还会产生重复条目。
    const observedAll = result.aggregate.allViolations.map(baselineEntryFromViolation);
    const inScope = buildScopePredicate(ctx, observedAll);
    const observedScoped = mergeScoped ? observedAll.filter(inScope) : observedAll;
    const skippedOutOfScope = observedAll.length - observedScoped.length;
    const observed = collapseEntriesByWaiverKey(observedScoped);
    const preserved = mergeScoped ? existing.filter((entry) => !inScope(entry)) : [];
    const replaced = mergeScoped ? existing.filter(inScope) : existing;
    // preserved 原样透传（不参与合并/收敛）——「作用域外的条目逐字节不动」是承诺，不是尽力而为。
    const merged = [...preserved, ...observed];
    const diff = diffEntries(replaced, observed);
    printUpdateSummary({
        narrowed,
        scopeLabel: describeUpdateScope(ctx, narrowed),
        diff,
        preservedCount: preserved.length,
        skippedOutOfScope,
        totalAfter: merged.length,
        baselinePath: ctx.baselinePath,
        dryRun: ctx.dryRun,
    });
    if (ctx.dryRun)
        return 0;
    writeBaselineEntriesFile(ctx.baselinePath, merged);
    console.info(`arch-guard: wrote ${merged.length} entries to ${ctx.baselinePath}.`);
    return 0;
}
/**
 * `baseline prune`：只退役 stale 条目。
 *
 * 0.2.x 把这件事挂在 `run` 上并默认开启，于是「逐条看违规」这种只读动作会改棘轮，
 * 制造出「报告 exit 0、`git checkout` 基线后 exit 1」的假绿。现在它是独立命令。
 */
async function baselinePrune(args) {
    const ctx = await loadBaselineCommandContext(args);
    if (refuseEmptyScope(ctx, 'prune'))
        return 0;
    if (ctx.fileScopeActive || isFilterActive(ctx.filter)) {
        console.error('arch-guard: `baseline prune` refuses to run under --file / --changed / --staged / --only / --skip / --tag: ' +
            'checks that did not run would look stale and be dropped. Retire scoped entries with `baseline update --file …`.');
        return 2;
    }
    const existing = readBaselineEntries(ctx.baselinePath);
    if (existing.length === 0) {
        console.info(`arch-guard: baseline ${ctx.baselinePath} is empty; nothing to prune.`);
        return 0;
    }
    const result = await runArchGuard({
        config: ctx.config,
        reporters: ctx.reporters,
        baselinePath: ctx.baselinePath,
        warnStaleBaseline: false,
        fix: false,
    });
    const scan = result.baselineScan;
    if (!scan) {
        console.error('arch-guard: baseline was not loaded (was --no-baseline passed?).');
        return 2;
    }
    const stale = scan.staleEntries;
    const matched = scan.matchedEntries;
    // 配额没用满的条目留着几份空白支票，那和 stale 条目是同一种债——prune 也要把它收回来。
    const surrenderedQuota = totalCapacity(existing.filter((entry) => entry.contentDigest !== undefined)) -
        totalCapacity(matched.filter((entry) => entry.contentDigest !== undefined)) -
        totalCapacity(stale.filter((entry) => entry.contentDigest !== undefined));
    if (stale.length === 0 && surrenderedQuota <= 0) {
        console.info(`arch-guard: no stale entries in ${ctx.baselinePath} (${matched.length} still matched).`);
        return 0;
    }
    // 安全阀：一条都没命中通常意味着配置 / root 跑歪了，而不是债全清了。
    if (matched.length === 0 && !toBoolean(args.options.force)) {
        console.error(`arch-guard: refusing to prune all ${stale.length} entries — this run matched none of them, ` +
            'which usually means the config, --root or the file scope is wrong. Re-check, then pass --force if it is real.');
        return 2;
    }
    if (stale.length > 0) {
        console.info(`arch-guard: ${stale.length} stale entr${stale.length === 1 ? 'y' : 'ies'} to retire:`);
        printEntrySample(stale);
    }
    if (surrenderedQuota > 0) {
        console.info(`arch-guard: ${surrenderedQuota} unused waiver slot(s) on still-matched entries will be given back ` +
            '(the entry froze N occurrences of the same code and this run only found fewer).');
    }
    const contentMismatches = scan.contentMismatches.filter((item) => item.kind === 'content');
    if (contentMismatches.length > 0) {
        console.info(`arch-guard: ${contentMismatches.length} of them are content mismatches ` +
            '(the frozen code is gone but a different violation now sits on the same line) — those are new debt, not fixed debt.');
    }
    if (ctx.dryRun) {
        console.info('arch-guard: --dry-run, baseline not written.');
        return 0;
    }
    writeBaselineEntriesFile(ctx.baselinePath, matched);
    console.info(`arch-guard: wrote ${matched.length} entries to ${ctx.baselinePath}.`);
    return 0;
}
function totalCapacity(entries) {
    return entries.reduce((sum, entry) => sum + entryWaiverCount(entry), 0);
}
/**
 * `baseline migrate`：给存量条目补第二道身份 `contentDigest`。
 *
 * 摘要**从条目自己冻着的 message 算**，不是从当前代码算：如果两者对不上，说明这个 fingerprint
 * 现在盖的是另一条违规（行号撞车），那本来就该红。默认不认领现场内容，只报告；确认无害时用
 * `--adopt-live-message` 采纳。
 *
 * **每一条都补摘要，包括本次 run 匹配不到的那些。** 摘要是 `contentDigestForMessage(entry.message)`
 * ——离线就能算，根本不需要现场有对应违规。旧实现在「匹配不到」时原样推回、不带摘要，于是
 * `isWaived` 继续用 `::*` 通配盖住那个 (文件, 行, 规则) 槽位＝一张**永久空白支票**：用来关洞①
 * 的迁移，恰好把洞①留在了最危险的那些槽位上（真实 Platform 基线里是 74 条）。
 */
async function baselineMigrate(args) {
    const ctx = await loadBaselineCommandContext(args);
    if (refuseEmptyScope(ctx, 'migrate'))
        return 0;
    if (ctx.fileScopeActive || isFilterActive(ctx.filter)) {
        console.error('arch-guard: `baseline migrate` runs on the whole repository; drop the scope flags.');
        return 2;
    }
    const existing = readBaselineEntries(ctx.baselinePath);
    if (existing.length === 0) {
        console.info(`arch-guard: baseline ${ctx.baselinePath} is empty; nothing to migrate.`);
        return 0;
    }
    const result = await runArchGuard({
        config: ctx.config,
        reporters: ctx.reporters,
        ignoreBaseline: true,
        baselinePath: ctx.baselinePath,
        warnStaleBaseline: false,
        fix: false,
    });
    const liveByKey = new Map();
    for (const violation of result.aggregate.allViolations) {
        const key = violationKey(violation);
        const bucket = liveByKey.get(key);
        if (bucket)
            bucket.push(violation);
        else
            liveByKey.set(key, [violation]);
    }
    const adoptLive = toBoolean(args.options['adopt-live-message']);
    const migrated = [];
    const mismatches = [];
    let alreadyDigested = 0;
    let attachedWithLiveMatch = 0;
    let attachedOffline = 0;
    let collidingFingerprints = 0;
    for (const entry of existing) {
        if (entry.contentDigest !== undefined) {
            alreadyDigested += 1;
            migrated.push(entry);
            continue;
        }
        const frozenDigest = contentDigestForMessage(entry.message);
        const live = liveByKey.get(keyFromBaselineEntry(entry));
        if (!live || live.length === 0) {
            // 本次 run 里这个指纹一条违规都没有：条目已经 stale。摘要照补——它只会把这个槽位
            // 从「通配任何未来违规」收紧成「只认这一份内容」，现在什么都不会改变，
            // 以后不会再变成空白支票。收紧不是放宽，正是迁移该做的事。
            attachedOffline += 1;
            migrated.push({ ...entry, contentDigest: frozenDigest });
            continue;
        }
        if (live.length > 1)
            collidingFingerprints += 1;
        // 同指纹可能盖着多条现存违规；只要有一条与冻结内容一致，就是干净的匹配。
        const exact = live.find((violation) => contentDigestForMessage(violation.message) === frozenDigest);
        if (exact) {
            migrated.push({ ...entry, contentDigest: frozenDigest });
            attachedWithLiveMatch += 1;
            continue;
        }
        mismatches.push({ entry, live: live[0].message });
        migrated.push({
            ...entry,
            contentDigest: adoptLive ? contentDigestForMessage(live[0].message) : frozenDigest,
        });
        attachedWithLiveMatch += 1;
    }
    const attached = attachedWithLiveMatch + attachedOffline;
    console.info(`arch-guard: baseline migrate — ${attached} entr${attached === 1 ? 'y' : 'ies'} gained a content digest ` +
        `(${attachedWithLiveMatch} matched by this run, ${attachedOffline} computed offline from the frozen ` +
        `message because this run did not match their fingerprint at all), ${alreadyDigested} already had one.`);
    if (collidingFingerprints > 0) {
        console.info(`arch-guard: ${collidingFingerprints} fingerprint${collidingFingerprints === 1 ? '' : 's'} matched more than ` +
            'one live violation — that is the collision this digest exists to stop.');
    }
    if (mismatches.length > 0) {
        console.info(`arch-guard: ${mismatches.length} entr${mismatches.length === 1 ? 'y' : 'ies'} freeze code that no longer exists ` +
            `at that fingerprint${adoptLive ? ' — adopted the live content as requested' : ' — kept the FROZEN content, so the live violation will now fail the gate'}:`);
        for (const mismatch of mismatches.slice(0, EntrySampleLimit)) {
            console.info(`  frozen: ${mismatch.entry.message}`);
            console.info(`  live  : ${mismatch.live}`);
        }
        if (mismatches.length > EntrySampleLimit) {
            console.info(`  … and ${mismatches.length - EntrySampleLimit} more.`);
        }
    }
    printMigrationImpact(existing, migrated, result.aggregate.allViolations);
    if (ctx.dryRun) {
        console.info('arch-guard: --dry-run, baseline not written.');
        return 0;
    }
    writeBaselineEntriesFile(ctx.baselinePath, migrated);
    console.info(`arch-guard: wrote ${migrated.length} entries to ${ctx.baselinePath}.`);
    return 0;
}
/**
 * 迁移的**门影响**预估：今天豁免、迁移后不再豁免的违规**逐条数**。
 *
 * 旧实现只在「某指纹下没有任何现存违规匹配冻结摘要」时记一条 mismatch；指纹下有 N 条、
 * 其中一条对上时，另外 N−1 条迁移后会失豁免变红，却既不计数也不列出。真实基线上它说 1 条、
 * 实际多了 18 条——低报约 20 倍，而 `--dry-run` 存在的全部意义就是这个数。
 *
 * 唯一诚实的算法是把两份基线都跑一遍：拿迁移前后的 `Baseline` 各过一次全量违规。
 */
function printMigrationImpact(before, after, violations) {
    const beforeScan = new Baseline(before).openScan();
    const afterScan = new Baseline(after).openScan();
    const losing = [];
    for (const violation of violations) {
        const wasWaived = beforeScan.isWaived(violation);
        const isWaived = afterScan.isWaived(violation);
        if (wasWaived && !isWaived)
            losing.push(violation);
    }
    if (losing.length === 0) {
        console.info('arch-guard: no currently-waived violation loses its waiver from this migration.');
        return;
    }
    console.info(`arch-guard: ${losing.length} violation${losing.length === 1 ? '' : 's'} waived today will STOP being waived ` +
        'after this migration — they are the collisions the digest exists to catch, and they will fail the gate:');
    printEntrySample(losing.map(baselineEntryFromViolation));
}
/**
 * `baseline check`：只校验现有 baseline 是否覆盖全部违规（不写盘）。
 *
 * 旧实现带着 `ignoreBaseline: true` 跑，然后对「有没有违规」判失败——那是在问「这个仓库有没有
 * 违规」，不是它宣称回答的「基线覆盖全了吗」。于是基线 100% 覆盖时它照样报「有未覆盖的违规」，
 * exit 0 只在零违规的仓里可达＝一个恒假的红。基线要不要装，就得**带着基线**跑。
 */
async function baselineCheck(args) {
    const ctx = await loadBaselineCommandContext(args);
    // 空作用域是**告示**，不是拒绝：`baseline check` 只读，短路它会连「不读文件扫描面的 check」
    // 一起跳过，那才是让门变松。这里只保证「扫了零个文件」不会被读成「扫完了没问题」。
    if (ctx.emptyScopeNotice !== undefined) {
        console.info(`arch-guard: ${ctx.emptyScopeNotice} — no file was scanned; only checks that ignore the ` +
            'file scan surface had anything to say.');
    }
    const result = await runArchGuard({
        config: ctx.scopedConfig,
        filter: ctx.filter,
        reporters: [stylishReporter],
        ignoreBaseline: false,
        baselinePath: ctx.baselinePath,
        warnStaleBaseline: false,
        fix: false,
        fileScopeActive: ctx.fileScopeActive,
    });
    const uncovered = result.aggregate.allViolations.length;
    if (uncovered > 0) {
        console.error(`arch-guard: ${uncovered} violation${uncovered === 1 ? '' : 's'} not covered by ${ctx.baselinePath}. ` +
            'Fix them, or freeze them with `arch-guard baseline update --file <path>`.');
        return 1;
    }
    // 空作用域下「覆盖了每一条违规」是句空话（分母是零）——别把它说成体检合格。
    if (ctx.emptyScopeNotice !== undefined) {
        console.info(`arch-guard: nothing was scanned, so there was nothing for ${ctx.baselinePath} to cover.`);
        return 0;
    }
    const status = result.baselineStatus;
    if (status && status.staleCount > 0) {
        console.info(`arch-guard: baseline covers every violation. ${status.staleCount} entr${status.staleCount === 1 ? 'y is' : 'ies are'} ` +
            'stale (already-fixed debt still frozen) — retire them with `arch-guard baseline prune`.');
        return 0;
    }
    console.info(`arch-guard: baseline covers every violation (${ctx.baselinePath}).`);
    return 0;
}
/**
 * 判定一条存量条目是否落在本次作用域内。
 *
 * 两个轴都要过：产出它的 check 这次真的跑了，且它的文件落在 `--file` / `--changed` 的范围内。
 * 判「跑了」用与 runner 相同的过滤器 + severity 口径，避免 `--only` 时把别的 check 的条目误删。
 *
 * **没有 `file` 的条目不能一律判域外。** 判域外 = 原样保留；而同一条违规现在带着 `file`
 * 被观察到、判了域内、于是又被冻一遍——同一条债在基线里出现两次。这类条目自己定位不到，
 * 那就问本次观察：作用域内出现了同指纹的违规，就说明它的现世形态正在被重写，它该退场。
 */
function buildScopePredicate(ctx, observed) {
    const filter = buildCheckFilter(ctx.filter);
    const ranCheckIds = new Set(collectAllChecks(ctx.config)
        .filter((check) => effectiveSeverity(check, ctx.config) !== 'off' && passesFilter(check, filter))
        .map((check) => check.id));
    const matchesFile = ctx.fileScopeActive ? buildFileScopeMatcher(ctx.scopeFiles) : undefined;
    // 只用**带 file** 的观察结果建这张表，避免与谓词自身互相递归。
    const observedInScope = new Set(matchesFile
        ? observed
            .filter((entry) => entry.file !== undefined && matchesFile(normalizeEntryFile(entry.file)))
            .map(keyFromBaselineEntry)
        : []);
    return (entry) => {
        if (!ranCheckIds.has(entry.checkId))
            return false;
        if (!matchesFile)
            return true;
        if (entry.file !== undefined)
            return matchesFile(normalizeEntryFile(entry.file));
        return observedInScope.has(keyFromBaselineEntry(entry));
    };
}
/**
 * 条目里的路径写法与 `--file` 实参对齐。
 *
 * `--file` 的实参已经过 `normalizeFileScopePath`（仓库根相对 + 正斜杠 + 去掉 `./`），
 * 而 `entry.file` 是各条 check 自己填的，`./src/a.ts` 与 `src\a.ts` 都出现过。
 * 不归一就会把域内条目判成域外——保留 + 重冻 = 重复条目。
 */
function normalizeEntryFile(file) {
    return file.replaceAll('\\', '/').replace(/^\.\/+/, '').replace(/\/+$/, '');
}
/** `--file` 接受文件 / 目录 / glob 三种形态，这里统一成一个 predicate。 */
function buildFileScopeMatcher(scopeFiles) {
    const globs = [];
    const exact = new Set();
    const directories = [];
    for (const raw of scopeFiles) {
        const entry = normalizeEntryFile(raw);
        if (!entry)
            continue;
        if (/[*?[\]{}]/.test(entry))
            globs.push(entry);
        else if (/\.[cm]?[jt]sx?$/.test(entry))
            exact.add(entry);
        else
            directories.push(entry);
    }
    const globMatch = globs.length > 0 ? picomatch(globs) : undefined;
    return (file) => {
        if (exact.has(file))
            return true;
        if (directories.some((directory) => file === directory || file.startsWith(`${directory}/`))) {
            return true;
        }
        return globMatch ? globMatch(file) : false;
    };
}
/**
 * 差异按**豁免键**（指纹 + 内容摘要）+ **配额**算。
 *
 * 只按指纹算会把「同一行换了另一条违规」显示成 unchanged——而那正是要抓的东西；
 * 不看配额则会把「同一行的同形态违规从 1 份变成 3 份」也显示成 unchanged。
 */
function diffEntries(before, after) {
    const beforeCounts = capacityByWaiverKey(before);
    const beforeByFingerprint = new Map();
    for (const entry of before) {
        const key = keyFromBaselineEntry(entry);
        const bucket = beforeByFingerprint.get(key);
        if (bucket)
            bucket.push(entry);
        else
            beforeByFingerprint.set(key, [entry]);
    }
    const afterFingerprints = new Set(after.map(keyFromBaselineEntry));
    const added = [];
    const contentChanged = [];
    const grown = [];
    let digestAddedCount = 0;
    let keptCount = 0;
    for (const entry of after) {
        const previousCapacity = beforeCounts.get(waiverKeyFromBaselineEntry(entry)) ?? 0;
        if (previousCapacity > 0) {
            keptCount += 1;
            const nextCapacity = entryWaiverCount(entry);
            if (nextCapacity > previousCapacity) {
                grown.push({ entry, before: previousCapacity, after: nextCapacity });
            }
            continue;
        }
        const previous = beforeByFingerprint.get(keyFromBaselineEntry(entry));
        if (!previous) {
            added.push(entry);
            continue;
        }
        // 指纹本来就在：要么只是补摘要（首次迁移），要么同一行的内容真的换了。
        if (previous.every((old) => old.contentDigest === undefined))
            digestAddedCount += 1;
        else
            contentChanged.push(entry);
    }
    const afterCounts = capacityByWaiverKey(after);
    return {
        added,
        removed: before.filter((entry) => !afterFingerprints.has(keyFromBaselineEntry(entry)) &&
            !afterCounts.has(waiverKeyFromBaselineEntry(entry))),
        keptCount,
        digestAddedCount,
        contentChanged,
        grown,
    };
}
function capacityByWaiverKey(entries) {
    const result = new Map();
    for (const entry of entries) {
        const key = waiverKeyFromBaselineEntry(entry);
        result.set(key, (result.get(key) ?? 0) + entryWaiverCount(entry));
    }
    return result;
}
function printUpdateSummary(input) {
    const { diff } = input;
    const grownDelta = diff.grown.reduce((sum, item) => sum + (item.after - item.before), 0);
    console.info(`arch-guard: baseline update (${input.scopeLabel}) — ` +
        `+${diff.added.length} new / -${diff.removed.length} retired / ${diff.keptCount} unchanged` +
        (grownDelta > 0 ? ` / +${grownDelta} extra occurrence(s) at existing entries` : '') +
        (diff.digestAddedCount > 0 ? ` / ${diff.digestAddedCount} gained a content digest` : '') +
        (diff.contentChanged.length > 0
            ? ` / ${diff.contentChanged.length} changed content at the same fingerprint`
            : '') +
        // 保留数与「收窄与否」无关：`--skip X` 不算收窄，但 X 的条目确实原样留下了，得说。
        (input.preservedCount > 0
            ? ` / ${input.preservedCount} left untouched outside the scope`
            : '') +
        ` → ${input.totalAfter} entries.`);
    if (input.skippedOutOfScope > 0) {
        console.info(`arch-guard: ${input.skippedOutOfScope} violation(s) reported by this run fall outside the scope and were ` +
            'NOT frozen (checks that do not read the file scan surface still report repository-wide). ' +
            'They keep failing the gate until somebody freezes or fixes them on purpose.');
    }
    if (diff.contentChanged.length > 0) {
        console.info('arch-guard: these entries kept their fingerprint but froze different code — the old entry was ' +
            'waiving a violation it had never seen:');
        printEntrySample(diff.contentChanged);
    }
    if (diff.grown.length > 0) {
        console.info(`arch-guard: ${diff.grown.length} entr${diff.grown.length === 1 ? 'y' : 'ies'} now waive MORE occurrences of the ` +
            'same code than before — the extra ones are new debt:');
        for (const item of diff.grown.slice(0, EntrySampleLimit)) {
            console.info(`    - ${item.before} → ${item.after}  ${item.entry.message}`);
        }
    }
    if (diff.added.length > 0) {
        console.info(input.narrowed
            ? `arch-guard: freezing ${diff.added.length} new violation(s):`
            : `arch-guard: freezing ${diff.added.length} NEW violation(s) — an unscoped update also freezes debt you did not write. ` +
                'Scope it with `--file` / `--changed` / `--only` next time (`--skip` does NOT narrow anything ' +
                'it just names what to leave out). Newly frozen:');
        printEntrySample(diff.added);
    }
    if (input.dryRun)
        console.info('arch-guard: --dry-run, baseline not written.');
}
const EntrySampleLimit = 20;
function printEntrySample(entries) {
    const byCheck = new Map();
    for (const entry of entries)
        byCheck.set(entry.checkId, (byCheck.get(entry.checkId) ?? 0) + 1);
    for (const [checkId, count] of [...byCheck].sort((a, b) => b[1] - a[1])) {
        console.info(`  ${count.toString().padStart(5)}  ${checkId}`);
    }
    for (const entry of entries.slice(0, EntrySampleLimit)) {
        console.info(`    - ${entry.message}`);
    }
    if (entries.length > EntrySampleLimit) {
        console.info(`    … and ${entries.length - EntrySampleLimit} more.`);
    }
}
export { baselineCommand };
//# sourceMappingURL=baseline.js.map