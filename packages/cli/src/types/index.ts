export interface ChatSession {
    sessionId: string;
    creationDate: number;
    lastMessageDate: number;
    title?: string;
    requestCount: number;
    filePath: string;
    source: string;
    workspaceName?: string;
    workspacePath?: string;
    metadata?: any; // Provider-specific metadata (e.g. agentFiles for Claude)
}
