import type { Context } from '@deepseek-ai/cordis';
export declare const name = "agent-team-room-commands";
export declare const inject: string[];
export type ParsedRoomTemplateCommand = {
    readonly action: 'list';
} | {
    readonly action: 'show';
    readonly templateId: string;
} | {
    readonly action: 'create';
    readonly templateId: string;
    readonly name?: string;
    readonly objective?: string;
    readonly provider?: string;
    readonly modelProvider?: string;
    readonly model?: string;
};
/** Parse the exact input following `/room-template`. Throws a user-facing syntax error. */
export declare function parseRoomTemplateCommand(rawInput: string): ParsedRoomTemplateCommand;
/** Register the Host-native Room template command. */
export declare function apply(ctx: Context): void;
//# sourceMappingURL=commands.d.ts.map