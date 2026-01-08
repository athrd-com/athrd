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

export interface ReadFileToolCallParams extends CursorToolCallParams {
  targetFile: string;
  charsLimit: number;
  effectiveUri: string;
}

export interface CursorToolCallResult {
  success: boolean;
  [key: string]: any;
}

export interface TodosToolCallResult extends CursorToolCallResult {
  finalTodos: Array<{
    id: string;
    content: string;
    status: "pending" | "in_progress" | "completed" | "cancelled";
  }>;
}

export interface ReadFileToolCallResult extends CursorToolCallResult {
  contents: string;
  numCharactersInRequestedRange: number;
  totalLinesInFile: number;
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
  params: CursorToolCallParams | ReadFileToolCallParams | null;
  result:
    | CursorToolCallResult
    | TodosToolCallResult
    | ReadFileToolCallResult
    | null;
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
