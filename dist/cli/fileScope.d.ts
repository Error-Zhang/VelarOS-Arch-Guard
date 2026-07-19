import type { ResolvedConfig } from '../config/types.js';
import { type ParsedArgs } from './argv.js';
interface CliFileScopeResult {
    config: ResolvedConfig;
    active: boolean;
    files: string[];
}
declare function applyCliFileScope(config: ResolvedConfig, args: ParsedArgs): CliFileScopeResult;
export { applyCliFileScope };
export type { CliFileScopeResult };
//# sourceMappingURL=fileScope.d.ts.map