import { Lightbulb } from "lucide-react";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";

interface AgentPromptProps {
  prompt: string;
  thinking?: string;
}

export default function AgentPrompt({ prompt, thinking }: AgentPromptProps) {
  return (
    <>
      {thinking && (
        <div className="mb-3">
          <Badge variant="outline" className="gap-1.5 text-xs">
            <Lightbulb className="h-3 w-3" />
            Thinking
          </Badge>
        </div>
      )}
      <Card className="p-4 border-none bg-none">
        <p className="text-sm text-muted-foreground leading-relaxed">
          {prompt}
        </p>
      </Card>
    </>
  );
}
