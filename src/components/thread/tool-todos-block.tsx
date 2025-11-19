import { CheckCircle2, Circle } from "lucide-react";
import { Badge } from "../ui/badge";

type TodoStatus = "pending" | "in_progress" | "completed";

type Todo = {
  content: string;
  status: TodoStatus;
};

type ToolTodosBlockProps = {
  todos: Todo[];
  title?: string;
};

export default function ToolTodosBlock({
  todos,
  title = "Tasks",
}: ToolTodosBlockProps) {
  const getStatusIcon = (status: TodoStatus) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "in_progress":
        return <Circle className="h-4 w-4 text-blue-500" />;
      case "pending":
        return <Circle className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: TodoStatus) => {
    switch (status) {
      case "completed":
        return (
          <Badge
            variant="outline"
            className="text-green-400 bg-green-500/10 border-green-500/20 text-xs"
          >
            Done
          </Badge>
        );
      case "in_progress":
        return (
          <Badge
            variant="outline"
            className="text-blue-400 bg-blue-500/10 border-blue-500/20 text-xs"
          >
            In Progress
          </Badge>
        );
      case "pending":
        return (
          <Badge
            variant="outline"
            className="text-gray-400 bg-gray-500/10 border-gray-500/20 text-xs"
          >
            Pending
          </Badge>
        );
    }
  };

  return (
    <div className="my-4">
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm font-medium text-gray-300">{title}</h3>
        <Badge variant="outline" className="text-xs">
          {todos.length}
        </Badge>
      </div>
      <div className="space-y-2">
        {todos.map((todo, index) => (
          <div
            key={index}
            className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors"
          >
            <div className="mt-0.5">{getStatusIcon(todo.status)}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-200">{todo.content}</p>
            </div>
            <div className="shrink-0">{getStatusBadge(todo.status)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
