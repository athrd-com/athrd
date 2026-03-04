import type {
  AThrd,
} from "@/types/athrd";

interface RenderLlmTxtParams {
  thread: AThrd;
  metadata: {
    repoName?: string;
    modelsUsed?: string[];
    ide: string;
    title?: string;
  };
}

export function renderLlmTxt({
  thread,
  metadata,
}: RenderLlmTxtParams): string {
  const sections: string[] = [];
  const modelValue =
    metadata.modelsUsed && metadata.modelsUsed.length > 0
      ? metadata.modelsUsed.join(", ")
      : "unknown";

  sections.push(
    [
      `repo: ${metadata.repoName || "unknown"}`,
      `model: ${modelValue}`,
      `ide: ${metadata.ide || "unknown"}`,
      `title: ${metadata.title || "untitled"}`,
    ].join("\n"),
  );

  for (const message of thread.messages) {
    if (message.type === "user") {
      const content = normalizeText(message.content);
      if (!content) continue;
      sections.push(
        [
          "[USER]",
          content,
        ].join("\n"),
      );
      continue;
    }

    const content = normalizeText(message.content);
    if (!content) continue;
    sections.push(
      [
        buildHeader("ASSISTANT"),
        content,
      ].join("\n"),
    );
  }

  return sections.join("\n\n---\n\n");
}

function buildHeader(kind: string): string {
  return `[${kind}]`;
}

function normalizeText(value?: string): string {
  if (!value) return "";
  return value.trim();
}
