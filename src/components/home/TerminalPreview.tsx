"use client";

import { useEffect, useState } from "react";
import ClaudeThread from "../claude/claude-thread";
import ThreadHeader from "../thread/thread-header";
import type { ClaudeRequest } from "@/types/claude";
import type { GistOwner } from "@/lib/github";
import { IDE } from "@/types/ide";

const MOCK_OWNER: GistOwner = {
  login: "athrd-user",
  id: 123,
  avatar_url: "https://github.com/ghost.png",
  url: "https://github.com/athrd-user",
  html_url: "https://github.com/athrd-user",
  type: "User",
};

const MOCK_REQUESTS: ClaudeRequest[] = [
  {
    id: "req_1",
    type: "user",
    timestamp: "2024-01-01T10:00:00Z",
    message: {
      role: "user",
      content: "Create a simple counter component using React and Lucide icons.",
    },
  },
  {
    id: "req_2",
    type: "assistant",
    timestamp: "2024-01-01T10:00:05Z",
    message: {
      role: "assistant",
      id: "msg_1",
      model: "claude-3-5-sonnet-20241022",
      usage: {
        input_tokens: 100,
        output_tokens: 100,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation: {
          ephemeral_1h_input_tokens: 0,
          ephemeral_5m_input_tokens: 0,
        },
        service_tier: "default",
      },
      content: [
        {
          type: "thinking",
          thinking:
            "I need to create a React component that implements a counter. I'll use the `useState` hook for the count value and `Plus` and `Minus` icons from `lucide-react` for the buttons.",
        },
      ],
    },
  },
  {
    id: "req_3",
    type: "assistant",
    timestamp: "2025-12-01T10:00:10Z",
    message: {
      role: "assistant",
      id: "msg_2",
      model: "claude-3-5-sonnet-20241022",
      usage: {
        input_tokens: 100,
        output_tokens: 100,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation: {
          ephemeral_1h_input_tokens: 0,
          ephemeral_5m_input_tokens: 0,
        },
        service_tier: "default",
      },
      content: [
        {
          type: "tool_use",
          name: "Bash",
          id: "tool_1",
          input: {
            command: "npm install lucide-react",
          },
        },
      ],
    },
  },
  {
    id: "req_4",
    type: "user",
    timestamp: "2024-01-01T10:00:12Z",
    message: {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "tool_1",
          content: "added 1 package in 1s",
        },
      ],
    },
  },
  {
    id: "req_5",
    type: "assistant",
    timestamp: "2024-01-01T10:00:15Z",
    message: {
      role: "assistant",
      id: "msg_3",
      model: "claude-3-5-sonnet-20241022",
      usage: {
        input_tokens: 100,
        output_tokens: 100,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation: {
          ephemeral_1h_input_tokens: 0,
          ephemeral_5m_input_tokens: 0,
        },
        service_tier: "default",
      },
      content: [
        {
          type: "tool_use",
          name: "Edit",
          id: "tool_2",
          input: {
            file_path: "src/components/Counter.tsx",
            old_string: "",
            new_string: `import { useState } from "react";
import { Minus, Plus } from "lucide-react";

export function Counter() {
  const [count, setCount] = useState(0);

  return (
    <div className="flex items-center gap-4 p-4 bg-gray-100 rounded-lg">
      <button
        onClick={() => setCount(c => c - 1)}
        className="p-2 hover:bg-gray-200 rounded-full transition-colors"
      >
        <Minus size={20} />
      </button>
      <span className="text-2xl font-bold w-8 text-center">{count}</span>
      <button
        onClick={() => setCount(c => c + 1)}
        className="p-2 hover:bg-gray-200 rounded-full transition-colors"
      >
        <Plus size={20} />
      </button>
    </div>
  );
}`,
          },
        },
      ],
    },
  },
];

export function TerminalPreview() {


  return (
    <div className="w-full max-w-[1000px] mx-auto p-px bg-linear-to-b from-gray-800 to-gray-900 rounded-xl shadow-2xl shadow-blue-900/10">
      <div className="bg-white dark:bg-[#0a0b10] rounded-xl overflow-hidden border border-white/5 min-h-[400px] relative transition-all duration-500 ease-in-out">
        <div className="pb-8">
          <div className="max-w-4xl mx-auto px-6 pt-8">
            <ThreadHeader
              owner={MOCK_OWNER}
              createdAt="2025-11-01T10:00:00Z"
              title="React Counter Component"
              ide={IDE.CLAUDE_CODE}
            />
          </div>
          <ClaudeThread
            owner={MOCK_OWNER}
            thread={{ requests: MOCK_REQUESTS }}
          />
        </div>
      </div>
    </div>
  );
}
