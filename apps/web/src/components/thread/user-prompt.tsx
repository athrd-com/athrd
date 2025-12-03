import type { GistOwner } from "@/lib/github";
import type { IFile } from "@/lib/providers";
import { File, Image } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "~/components/ui/hover-card";
import Markdown from "markdown-to-jsx";

interface UserPromptProps {
  owner: GistOwner;
  prompt: string;
  files?: IFile[];
}

export default function UserPrompt({
  owner,
  prompt,
  files = [],
}: UserPromptProps) {
  const getFileContent = (file: IFile) => {
    if (file.kind === "image" && file.value) {
      try {
        // The value is an object like {0: 123, 1: 45, ...}
        // We need to convert it to a Uint8Array and then to base64
        const values = Object.values(file.value) as number[];
        const uint8Array = new Uint8Array(values);
        let binary = "";
        const len = uint8Array.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(uint8Array[i] ?? 0);
        }
        const base64 = btoa(binary);
        return `data:image/png;base64,${base64}`;
      } catch (e) {
        console.error("Failed to parse image buffer", e);
        return null;
      }
    }
    return null;
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-4 group">
        <Avatar className="h-8 w-8 mt-1 border border-white/10">
          <AvatarImage src={owner.avatar_url} alt={owner.login} className="" />
          <AvatarFallback className="bg-blue-900/30 text-blue-200 text-xs">
            {owner.login.substring(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <Card className="p-4 gap-2 bg-[#111] border-white/10 shadow-none text-gray-300 min-w-0 max-w-full">
          {files.length > 0 && (
            <div className="flex gap-2 mb-2 flex-wrap">
              {files.map((f) => {
                const imageSrc = getFileContent(f);
                const badge = (
                  <Badge
                    key={f.id}
                    variant="outline"
                    className="rounded-md text-xs bg-blue-500/10 border-blue-500/20 text-blue-400 font-mono px-2 py-0.5 cursor-pointer hover:bg-blue-500/20 transition-colors"
                  >
                    {f.kind === "image" && <Image className="w-3 h-3 mr-1" />}
                    {f.kind === "file" && <File className="w-3 h-3 mr-1" />}
                    {f.name}
                  </Badge>
                );

                if (imageSrc) {
                  return (
                    <HoverCard key={f.id}>
                      <HoverCardTrigger asChild>{badge}</HoverCardTrigger>
                      <HoverCardContent className="w-auto p-2 bg-[#111] border-white/10">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={imageSrc}
                          alt={f.name}
                          className="max-w-[300px] max-h-[300px] rounded-md object-contain"
                        />
                      </HoverCardContent>
                    </HoverCard>
                  );
                }

                return badge;
              })}
            </div>
          )}
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-gray-200 markdown-content overflow-x-auto">
            <Markdown>{prompt}</Markdown>
          </p>
        </Card>
      </div>
    </div>
  );
}
