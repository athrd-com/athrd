"use client";

import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  ChevronsDownUp,
  ChevronsUpDown,
  Circle,
  ListTodo,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "../ui/badge";

export type TodoStatus = "pending" | "in_progress" | "completed";

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
  title = "Updated todos",
}: ToolTodosBlockProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);

  const completedCount = todos.filter((t) => t.status === "completed").length;
  const totalCount = todos.length;

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
    <div
      className={cn(
        "group rounded-lg p-3 flex items-center justify-between hover:bg-[#111] hover:border-white/20 transition-colors",
        !isCollapsed && "bg-[#111] border border-white/10"
      )}
    >
      <div className="w-full">
        <div
          className="flex justify-between w-full cursor-pointer"
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          <div
            className={cn(
              "flex items-center font-mono text-xs",
              !isCollapsed && "gap-2"
            )}
          >
            <ListTodo
              size={14}
              className={cn(
                "text-gray-400 stroke-3 transition-all -translate-x-2",
                !isCollapsed && "translate-x-0"
              )}
            />
            <span className="text-gray-300 font-medium">
              {title} ({completedCount}/{totalCount})
            </span>
          </div>
          <div className="ml-2 hidden group-hover:flex cursor-pointer">
            {isCollapsed ? (
              <ChevronsDownUp size={14} className="text-gray-500 shrink-0" />
            ) : (
              <ChevronsUpDown size={14} className="text-gray-500 shrink-0" />
            )}
          </div>
        </div>
        {!isCollapsed && (
          <div className="mt-3 space-y-2">
            {todos.map((todo, index) => (
              <div
                key={index}
                className="flex items-start gap-3 p-2 rounded-md bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors"
              >
                <div className="mt-0.5">{getStatusIcon(todo.status)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-200">{todo.content}</p>
                </div>
                <div className="shrink-0">{getStatusBadge(todo.status)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
