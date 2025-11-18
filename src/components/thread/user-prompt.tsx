import type { GistOwner } from "@/lib/github";
import type { IFile } from "@/lib/providers";
import { File } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";

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
              {files.map((f) => (
                <Badge
                  key={f.id}
                  variant="outline"
                  className="rounded-md text-xs bg-blue-500/10 border-blue-500/20 text-blue-400 font-mono px-2 py-0.5"
                >
                  <File className="w-3 h-3 mr-1" />
                  {f.name}
                </Badge>
              ))}
            </div>
          )}
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-gray-200">
            {prompt}
          </p>
        </Card>
      </div>
    </div>
  );
}
