import type { AthrdAssistantMessage, AthrdUserMessage } from "@/types/athrd";

export type ThreadRenderableMessage = AthrdUserMessage | AthrdAssistantMessage;

export interface ThreadMessageGroup {
  type: "user" | "assistant";
  anchorId: string;
  messages: ThreadRenderableMessage[];
}

export function getThreadAnchorId(messageId: string) {
  return `thread-${messageId}`;
}

export function getThreadAnchorHref(messageId: string) {
  return `#${getThreadAnchorId(messageId)}`;
}

export function groupMessages(
  messages: ThreadRenderableMessage[],
): ThreadMessageGroup[] {
  const groups: ThreadMessageGroup[] = [];

  for (const message of messages) {
    const lastGroup = groups[groups.length - 1];

    if (lastGroup && lastGroup.type === message.type) {
      lastGroup.messages.push(message);
      continue;
    }

    groups.push({
      type: message.type,
      anchorId: getThreadAnchorId(message.id),
      messages: [message],
    });
  }

  return groups;
}
