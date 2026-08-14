import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
export declare const name = "agent-team-room-dashboard";
export declare const inject: string[];
export interface Config {
    /** URL prefix served from the DSH Web host. */
    routePrefix: string;
    /** Permit direct non-loopback clients. Keep false unless another layer authenticates them. */
    allowRemote: boolean;
}
export declare const Config: z<Config>;
export declare function isLoopbackAddress(address: string | undefined): boolean;
/** Serve a read-only, loopback-by-default dashboard and JSON projection. */
export declare function apply(ctx: Context, config: Config): Promise<void>;
//# sourceMappingURL=dashboard.d.ts.map