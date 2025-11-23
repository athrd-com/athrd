export interface GeminiThread {
  messages: (GeminiUserMessage | GeminiAssistantMessage)[];
}

export interface GeminiUserMessage {
  id: string;
  type: "user";
  content: string;
}

export interface GeminiAssistantMessage {
  id: string;
  type: "gemini";
  content: string;
  timestamp: string;
  thoughts?: GeminiThinking[];
  toolCalls?: GeminiToolCall[];
  model: string;
}

export interface GeminiThinking {
  subject: string;
  description: string;
  timestamp: string;
}

export interface GeminiToolCall {
  id: string;
  name: string;
  args: {
    content: string;
    file_path: string;
  };
  result: Array<{
    functionResponse: {
      id: string;
      name: string;
      response: {
        output: string;
      };
    };
  }>;
  status: string;
  timestamp: string;
  displayName: string;
  description: string;
  renderOutputAsMarkdown: boolean;
}
