import { FileText } from "lucide-react";
import type { Attachment } from "~/lib/thread-parsers";
import CodeBlock from "~/components/code-block";

interface MessageAttachmentProps {
  attachment: Attachment;
}

/**
 * MessageAttachment: Renders different attachment types based on content
 * Provides extensible pattern for adding new attachment types
 * Extracted from Thread for better maintainability
 */
export default function MessageAttachment({
  attachment,
}: MessageAttachmentProps) {
  // File or URI references
  if (attachment.type === "file" || attachment.type === "uri") {
    const isEdit = (attachment.metadata?.isEdit as boolean | undefined) ?? false;
    return (
      <div className="rounded-md border border-gray-300 bg-gray-100 px-3 py-2 font-mono text-sm hover:bg-gray-150 transition-colors">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-gray-600 flex-shrink-0" />
          <span className="text-gray-700 break-all">{attachment.path}</span>
          {isEdit && (
            <span className="ml-auto rounded bg-green-100 px-1.5 py-0.5 text-green-700 text-xs font-medium whitespace-nowrap flex-shrink-0">
              edited
            </span>
          )}
        </div>
      </div>
    );
  }

  // Code blocks
  if (attachment.type === "code" && attachment.content) {
    return (
      <CodeBlock
        language={attachment.language || "plaintext"}
        code={attachment.content}
      />
    );
  }

  // Image attachments (placeholder for future enhancement)
  if (attachment.type === "image" && attachment.url) {
    return (
      <div className="rounded-lg overflow-hidden border border-gray-200">
        <img
          src={attachment.url}
          alt={attachment.path || "Attachment"}
          className="max-w-full h-auto"
        />
      </div>
    );
  }

  // Unknown attachment type - render nothing
  return null;
}
