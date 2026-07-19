import type { Check } from './defineCheck.js';
/**
 * Check 过滤器。
 *
 * CLI 的 --only/--skip/--tag 选项会归一到这个数据结构，
 * Runner 在调度前用 `passes(check)` 判定是否执行某个 check。
 */
interface CheckFilter {
    only?: ReadonlySet<string>;
    skip?: ReadonlySet<string>;
    tags?: ReadonlySet<string>;
}
interface CheckFilterInput {
    only?: readonly string[];
    skip?: readonly string[];
    tags?: readonly string[];
}
declare function buildCheckFilter(input?: CheckFilterInput): CheckFilter;
/** 判定一个 check 是否应被执行。 */
declare function passesFilter(check: Check, filter: CheckFilter): boolean;
export { buildCheckFilter, passesFilter };
export type { CheckFilter, CheckFilterInput };
//# sourceMappingURL=filter.d.ts.map