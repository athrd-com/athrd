import { ChatSession } from "../types/index.js";

export interface ChatProvider {
    readonly id: string;
    readonly name: string;

    findSessions(): Promise<ChatSession[]>;
    parseSession(session: ChatSession): Promise<any>;
}
