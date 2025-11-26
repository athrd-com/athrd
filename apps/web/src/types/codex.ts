export interface CodexThread {
  sessionId: string;
  timestamp: string;
  type: string;
  payload: CodexSessionMetaPayload;
  messages: CodexMessage[];
}

export interface CodexThreadMetadata {
  githubUsername?: string;
  githubRepo?: string;
  ide?: string;
  ghRepoId?: number;
  name?: string;
  orgId?: number;
  orgName?: string;
  orgIcon?: string;
}

export interface CodexSessionMetaPayload {
  id: string;
  timestamp: string;
  cwd: string;
  originator: string;
  cli_version: string;
  instructions: string | null;
  source: string;
  model_provider: string;
  git: CodexGitInfo;
}

export interface CodexGitInfo {
  commit_hash: string;
  branch: string;
  repository_url: string;
}

export type CodexMessage =
  | CodexEventMessage
  | CodexResponseItem
  | CodexTurnContextMessage;

export interface CodexEventMessage {
  timestamp: string;
  type: "event_msg";
  payload:
    | CodexAgentMessageEvent
    | CodexAgentReasoningEvent
    | CodexUserMessageEvent
    | CodexTokenCountPayload;
}

export interface CodexAgentMessageEvent {
  type: "agent_message";
  message: string;
}

export interface CodexAgentReasoningEvent {
  type: "agent_reasoning";
  text: string;
}

export interface CodexUserMessageEvent {
  type: "user_message";
  message: string;
  images: string[];
}

export interface CodexTokenCountPayload {
  type: "token_count";
  info: CodexTokenCountInfo | null;
  rate_limits: CodexRateLimits;
}

export interface CodexTokenCountInfo {
  total_token_usage: CodexTokenUsage;
  last_token_usage: CodexTokenUsage;
  model_context_window: number;
}

export interface CodexTokenUsage {
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  reasoning_output_tokens: number;
  total_tokens: number;
}

export interface CodexRateLimits {
  primary: any | null;
  secondary: any | null;
  credits: any | null;
}

export interface CodexResponseItem {
  timestamp: string;
  type: "response_item";
  payload: CodexResponsePayload;
}

export type CodexResponsePayload =
  | CodexResponseMessagePayload
  | CodexFunctionCallPayload
  | CodexFunctionCallOutputPayload
  | CodexGhostSnapshotPayload
  | CodexReasoningPayload;

export interface CodexResponseMessagePayload {
  type: "message";
  role: "user" | "assistant";
  content: CodexMessageContent[];
}

export type CodexMessageContent =
  | CodexInputTextContent
  | CodexOutputTextContent;

export interface CodexInputTextContent {
  type: "input_text";
  text: string;
}

export interface CodexOutputTextContent {
  type: "output_text";
  text: string;
}

export interface CodexFunctionCallPayload {
  type: "function_call";
  name: string;
  arguments: string;
  call_id: string;
}

export interface CodexFunctionCallOutputPayload {
  type: "function_call_output";
  call_id: string;
  output: string;
}

export interface CodexGhostSnapshotPayload {
  type: "ghost_snapshot";
  ghost_commit: CodexGhostCommit;
}

export interface CodexGhostCommit {
  id: string;
  parent?: string;
  preexisting_untracked_files?: string[];
  preexisting_untracked_dirs?: string[];
}

export interface CodexReasoningPayload {
  type: "reasoning";
  summary: CodexReasoningSummary[];
  content: string | null;
  encrypted_content?: string | null;
}

export interface CodexReasoningSummary {
  type: "summary_text";
  text: string;
}

export interface CodexTurnContextMessage {
  timestamp: string;
  type: "turn_context";
  payload: CodexTurnContextPayload;
}

export interface CodexTurnContextPayload {
  cwd: string;
  approval_policy: string;
  sandbox_policy: CodexSandboxPolicy;
  model: string;
  summary: string | null;
}

export interface CodexSandboxPolicy {
  type: string;
  network_access: boolean;
  exclude_tmpdir_env_var: boolean;
  exclude_slash_tmp: boolean;
}
