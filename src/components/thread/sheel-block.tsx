import { ChevronRight } from "lucide-react";

interface ShellBlockProps {
  command: string;
  explanation?: string;
}

export default function ShellBlock({ command, explanation }: ShellBlockProps) {
  return (
    <div className="my-4" title={explanation}>
      <div className="group bg-[#111] border border-white/10 rounded-lg p-3 flex items-center justify-between shadow-sm hover:border-white/20 transition-colors">
        <div className="flex items-center gap-3 font-mono text-xs">
          <ChevronRight size={14} className="text-blue-500 stroke-3" />
          <span className="text-gray-300 font-medium">{command}</span>
        </div>
      </div>
    </div>
  );
}
