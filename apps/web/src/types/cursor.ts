export interface CursorAthrdMetadata {
    githubUsername: string;
    githubRepo: string;
    ide: string;
    ghRepoId: number;
    name: string;
    orgId: number;
    orgName: string;
    orgIcon: string;
}

export interface CursorMetadata {
    name: string;
    createdAt: number;
    lastUpdatedAt: number;
    contextUsagePercent?: number;
    filesChangedCount?: number;
    workspaceName?: string;
    workspacePath?: string;
}

export interface CursorTokenCount {
    inputTokens: number;
    outputTokens: number;
}

export interface CursorToolCallParams {
    [key: string]: any;
}

export interface CursorToolCallResult {
    [key: string]: any;
}

export interface CursorToolCallAdditionalData {
    status?: string;
    [key: string]: any;
}

export interface CursorToolCall {
    tool?: string;
    toolId?: number;
    toolIndex?: number;
    status?: string;
    params: CursorToolCallParams | null;
    result: CursorToolCallResult | null;
    additionalData: CursorToolCallAdditionalData;
}

export interface CursorMessage {
    type: number;
    bubbleId: string;
    text: string;
    createdAt: string;
    tokenCount: CursorTokenCount;
    toolCall?: CursorToolCall;
}

export interface CursorThread {
    __athrd?: CursorAthrdMetadata;
    composerId: string;
    metadata: CursorMetadata;
    messages: CursorMessage[];
}
