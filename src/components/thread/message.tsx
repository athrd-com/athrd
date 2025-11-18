import { Avatar, AvatarFallback } from "./ui/avatar";

interface MessageProps {
  role: "user" | "assistant" | "system";
  text?: string;
  html?: string;
  username?: string;
  className?: string;
}

export default function Message({
  role,
  text,
  html,
  username,
  className = "",
}: MessageProps) {
  const isUser = role === "user";
  const displayName = username || (isUser ? "User" : "Assistant");
  const avatarLetter = displayName[0]?.toUpperCase() || (isUser ? "U" : "A");
  const avatarClass = isUser
    ? "bg-blue-500 text-white"
    : "bg-purple-500 text-white";
  const messageClass = isUser ? "bg-blue-50" : "bg-gray-50";

  return (
    <div className={`flex gap-4 ${className}`}>
      <Avatar className="h-8 w-8 mt-1 shrink-0">
        <AvatarFallback className={`${avatarClass} text-xs font-semibold`}>
          {avatarLetter}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1">
        <div className="mb-1 font-semibold text-sm">{displayName}</div>
        <div className={`rounded-lg px-4 py-3 ${messageClass}`}>
          {html ? (
            <div
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {text}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
