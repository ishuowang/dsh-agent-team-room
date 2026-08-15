import type { Context } from '@deepseek-ai/cordis';
export declare const name = "agent-team-room-commands";
export declare const inject: string[];
export type ParsedRoomCommand = {
    action: 'list';
    includeClosed: boolean;
} | {
    action: 'show';
    roomId: string;
} | {
    action: 'create';
    name: string;
    topic?: string;
} | {
    action: 'attach';
    roomId: string;
    sessionId: string;
    name?: string;
} | {
    action: 'remove';
    roomId: string;
    memberId: string;
    interrupt: boolean;
} | {
    action: 'send';
    roomId: string;
    memberId: string;
    message: string;
} | {
    action: 'broadcast';
    roomId: string;
    message: string;
} | {
    action: 'close';
    roomId: string;
    summary?: string;
    interrupt: boolean;
};
/** Tokenize command input without invoking a shell or accepting expansion. */
export declare function tokenizeRoomCommand(rawInput: string): string[];
export declare function parseRoomCommand(rawInput: string): ParsedRoomCommand;
/** Register the generic Host-native Room command used by the native UI. */
export declare function apply(ctx: Context): void;
//# sourceMappingURL=commands.d.ts.map