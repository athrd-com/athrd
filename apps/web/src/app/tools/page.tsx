import { Badge } from "@/components/ui/badge";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Check, Minus, X } from "lucide-react";

type SupportStatus = "n/a" | "partial" | "complete";

interface ToolSupport {
    name: string;
    vscode: SupportStatus;
    claude: SupportStatus;
    cursor: SupportStatus;
}

const tools: ToolSupport[] = [
    { name: "Terminal", vscode: "complete", claude: "complete", cursor: "n/a" },
    { name: "Read File", vscode: "complete", claude: "complete", cursor: "n/a" },
    { name: "Create File", vscode: "complete", claude: "n/a", cursor: "n/a" },
    { name: "Edit File", vscode: "n/a", claude: "complete", cursor: "n/a" },
    { name: "List Directory", vscode: "complete", claude: "n/a", cursor: "n/a" },
    { name: "Fetch Webpage", vscode: "complete", claude: "n/a", cursor: "n/a" },
    { name: "Search / Grep", vscode: "n/a", claude: "complete", cursor: "n/a" },
    { name: "Todo List", vscode: "n/a", claude: "complete", cursor: "n/a" },
    { name: "MCP", vscode: "complete", claude: "n/a", cursor: "n/a" },
];

const StatusBadge = ({ status }: { status: SupportStatus }) => {
    switch (status) {
        case "complete":
            return (
                <Badge className="bg-green-500 hover:bg-green-600 border-none">
                    <Check className="w-3 h-3 mr-1" />
                    Supported
                </Badge>
            );
        case "partial":
            return (
                <Badge
                    variant="secondary"
                    className="bg-yellow-500/15 text-yellow-700 hover:bg-yellow-500/25 dark:text-yellow-400"
                >
                    <Minus className="w-3 h-3 mr-1" />
                    Partial
                </Badge>
            );
        case "n/a":
        default:
            return (
                <Badge variant="outline" className="text-muted-foreground">
                    <X className="w-3 h-3 mr-1" />
                    N/A
                </Badge>
            );
    }
};

export default function ToolsPage() {
    return (
        <div className="min-h-screen max-w-7xl mx-auto w-full text-foreground p-8">
            <div className="w-full">
                <Card className="border-0">
                    <CardHeader>
                        <CardTitle>Tool Support Matrix</CardTitle>
                        <CardDescription>
                            A comparison of tool capabilities across different AI assistants.{" "}
                            <a
                                href="https://github.com/athrd-com/athrd/issues"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline hover:text-foreground transition-colors"
                            >
                                Report an issue
                            </a>
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-md border">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-muted/50 text-muted-foreground font-medium">
                                    <tr>
                                        <th className="px-4 py-3">Tool Name</th>
                                        <th className="px-4 py-3 text-center">VS Code</th>
                                        <th className="px-4 py-3 text-center">Claude</th>
                                        <th className="px-4 py-3 text-center">Cursor</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {tools.map((tool) => (
                                        <tr
                                            key={tool.name}
                                            className="hover:bg-muted/50 transition-colors"
                                        >
                                            <td className="px-4 py-3 font-medium">{tool.name}</td>
                                            <td className="px-4 py-3 text-center">
                                                <div className="flex justify-center">
                                                    <StatusBadge status={tool.vscode} />
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <div className="flex justify-center">
                                                    <StatusBadge status={tool.claude} />
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <div className="flex justify-center">
                                                    <StatusBadge status={tool.cursor} />
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
