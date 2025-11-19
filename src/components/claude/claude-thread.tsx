"use client";

import type { GistOwner } from "@/lib/github";
import type { ClaudeRequest } from "@/types/claude";
import ClaudeAssistantGroup from "./claude-assistant-group";
import ClaudeUserMessage from "./claude-user-message";
import { groupRequests } from "./utils";

type ClaudeThreadProps = {
  owner: GistOwner;
  thread: any;
};

export default function ClaudeThread({ owner, thread }: ClaudeThreadProps) {
  const claudeThread = thread as { requests: ClaudeRequest[] };
  console.log(claudeThread);

  const groupedRequests = groupRequests(claudeThread.requests);

  return (
    <div className="athrd-thread max-w-4xl mx-auto px-6 py-8">
      <div className="space-y-2">
        {groupedRequests.map((item) => {
          // Handle Assistant Group
          if (Array.isArray(item)) {
            const firstRequest = item[0];
            if (!firstRequest) return null;

            return (
              <ClaudeAssistantGroup
                key={firstRequest.id}
                group={item}
                allRequests={claudeThread.requests}
              />
            );
          }

          // Handle Single Request (User)
          return (
            <ClaudeUserMessage key={item.id} request={item} owner={owner} />
          );
        })}
      </div>
    </div>
  );
}
