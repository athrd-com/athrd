import { ChevronRight } from "lucide-react";

export function TerminalPreview() {
  return (
    <div className="w-full max-w-[1000px] mx-auto p-px bg-linear-to-b from-gray-800 to-gray-900 rounded-xl shadow-2xl shadow-blue-900/10">
      <div className="bg-[#0a0b10] rounded-xl overflow-hidden border border-white/5 min-h-[400px] p-6 font-mono text-sm md:text-base relative">
        {/* Background Grid Pattern inside terminal */}
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-5 pointer-events-none"></div>

        <div className="relative z-10 flex flex-col gap-6">
          {/* ASCII Art Title */}
          <div className="text-transparent bg-clip-text bg-linear-to-r from-blue-400 via-purple-400 to-red-400 font-black tracking-tighter leading-none select-none opacity-90">
            <pre className="text-[10px] md:text-xs leading-2 md:leading-2.5">
              {`
   db    d888888b db   db .d8888. d8888b. 
  d88b   '~~88~~' 88   88 88'  YP 88  \`8D 
 d8'88b     88    88ooo88 88'     88   88 
d8'  88b    88    88~~~88 88      88   88 
d8888888b   88    88   88 88.  .d 88  .8D 
88    88    YP    YP   YP Y88888P Y8888D' 
`}
            </pre>
          </div>

          {/* Instructions */}
          <div className="space-y-1 text-gray-400">
            <p className="text-gray-500">Tips for getting started:</p>
            <ol className="list-decimal list-inside space-y-1 pl-1">
              <li>Ask questions, edit files, or run commands.</li>
              <li>Be specific for the best results.</li>
              <li>
                Create{" "}
                <span className="text-purple-300 bg-purple-500/10 px-1 rounded">
                  ATHRD.md
                </span>{" "}
                files to customize your interactions.
              </li>
              <li>
                <span className="text-purple-300">/help</span> for more
                information.
              </li>
            </ol>
          </div>

          {/* Footer Status Line */}
          <div className="flex items-center justify-between text-xs text-gray-600 mt-4 border-b border-gray-800 pb-2 mb-2">
            <span>Using 1 ATHRD.md file</span>
            <span>1 MCP server</span>
          </div>

          {/* Input Area */}
          <div className="group relative">
            <div className="absolute -inset-0.5 bg-linear-to-r from-blue-500/20 to-purple-500/20 rounded blur opacity-0 group-focus-within:opacity-100 transition duration-500"></div>
            <div className="relative flex items-center bg-[#15151a] border border-gray-700 rounded p-3">
              <ChevronRight size={16} className="text-gray-400 mr-2" />
              <input
                type="text"
                placeholder="Ask Athrd to scaffold a web app"
                className="bg-transparent border-none outline-none text-gray-200 placeholder-gray-600 w-full font-mono"
                autoFocus
              />
            </div>
          </div>

          {/* Path Footer */}
          <div className="flex justify-between text-xs text-cyan-600 font-medium pt-2">
            <span>~/Developer/playground</span>
            <span className="text-gray-500">sandbox-exec (minimal)</span>
            <span className="text-blue-400">athrd-2.0-pro</span>
          </div>
        </div>
      </div>
    </div>
  );
}
