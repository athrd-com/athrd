import { Copy, Lightbulb, Link2, Star } from "lucide-react";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import CodeBlock from "./code-block";
import FileDiff from "./file-diff";
import ToolCall from "./tool-call";

export default function ThreadViewer() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background sticky top-0 z-50">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-sm">
                  A
                </span>
              </div>
              <span className="text-sm font-medium text-muted-foreground">
                Threads
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="text-sm text-muted-foreground hover:text-foreground">
              Workspace
            </button>
            <div className="w-6 h-6 bg-muted rounded-full" />
          </div>
        </div>
      </header>

      {/* Thread Header */}
      <div className="border-b border-border px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-xl font-semibold text-balance">
              Optimize SplitTree encoding with custom Codable
            </h1>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Link2 className="h-4 w-4" />
              </Button>
              <Badge variant="secondary" className="gap-1">
                <Copy className="h-3 w-3" />
                forked
              </Badge>
              <Badge variant="secondary" className="gap-1">
                <Star className="h-3 w-3" />0
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>created by</span>
            <Badge variant="outline">@product-engineering</Badge>
          </div>
        </div>
      </div>

      {/* Thread Messages */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="space-y-6">
          {/* User Message */}
          <div className="flex gap-4">
            <Avatar className="h-8 w-8 mt-1">
              <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                U
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="text-sm text-foreground leading-relaxed">
                <span className="font-medium">User: </span>
                <span className="text-muted-foreground">In Next.js</span>
              </div>
              <div className="mt-2 space-y-2">
                <p className="text-sm text-foreground">
                  Let me bug fix @test.swift -- this is caused by SplitTree
                  @Product/Service/SplitTree/SplitTree.swift including the full
                  task structure in the tree. The following should fix the path
                  needed -- Let's also try removing the "SplitTree" prefix on
                  the key names.
                </p>
              </div>
            </div>
          </div>

          {/* AI Message with Thinking */}
          <div className="flex gap-4">
            <Avatar className="h-8 w-8 mt-1">
              <AvatarFallback className="bg-accent text-accent-foreground text-xs">
                AI
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="mb-3">
                <Badge variant="outline" className="gap-1.5 text-xs">
                  <Lightbulb className="h-3 w-3" />
                  Thinking
                </Badge>
              </div>
              <Card className="p-4 bg-muted/50 border-muted">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  I'll fix the bug by implementing custom Codable for SplitTree
                  that skips the path to the created node instead of the full
                  node.
                </p>
              </Card>

              {/* Tool Calls */}
              <div className="mt-4 space-y-2">
                <ToolCall icon="✓" status="completed" text="Start TODOS" />
                <ToolCall icon="✓" status="completed" text="Updated TODOS" />
                <ToolCall icon="✓" status="completed" text="Explored TODOS" />
              </div>

              {/* AI Response */}
              <div className="mt-4 space-y-3">
                <p className="text-sm text-foreground leading-relaxed">
                  Now I have to have at the SplitTree struct and make sure it's
                  Codable, and check which methods are available for to node
                  selection.
                </p>

                <FileDiff
                  path="Product/Services/Features/SplitTree.swift"
                  additions={2}
                  deletions={0}
                />

                <CodeBlock
                  language="swift"
                  code={`/// Use path to a positive node in the tree
let path = node.path()
let path: [Component] ;

var (output: Node { push(index: 0) }`}
                />

                <p className="text-sm text-foreground leading-relaxed mt-4">
                  Now I'll evaluate this custom Codable for SplitTree. I need to
                  remove the automatic Codable conformance and add custom
                  implementation that skips the path.
                </p>

                <ToolCall icon="✓" status="completed" text="Updated TODOS" />

                <p className="text-sm text-foreground leading-relaxed mt-4">
                  I've evaluated the custom Codable for SplitTree. I need to
                  remove the automatic Codable conformance and add custom
                  implementation that skips the path to the created node instead
                  of the full node.
                </p>

                <FileDiff
                  path="Product/Services/Features/SplitTree.swift"
                  additions={8}
                  deletions={2}
                  highlighted
                />

                <CodeBlock
                  language="swift"
                  showDiff
                  code={`// existing represents a kind of token that can be printed
if case .token(let category) = entry {
-    case regular
-    case code
+enum Category: String, Codable {
+    case regular
+    case code
+    case header
}`}
                />

                <CodeBlock
                  language="swift"
                  showDiff
                  code={`/// The node has is internally encoded. A number path is EXPENSIVE to store on long the full
/// path so instead we store just the INDEX using the category as sort/cmp

self.init(from: any Decoder, forKey: codingKeys) -
    let container: KeyedContainer = try decoder.container(keyedBy: CodingKeys.self)
    try container.decodeIndirectFrontedMirroredContext.self, forKey: .parent)
    self.init(from: decoder, forKey: .currentCode)
+try containerIndexArray.decodeIfPresent(.self, forKey: .category)
+category: String? = try container.decodeIfPresent(String.self, format: .commandKey)
+if let categoryStr = category, let cat = Category.rawValue(from: categoryStr) { self.metadata = [try decoder container(sortCodeString.self, format: ..commandInfo(cat)
...`}
                />
              </div>
            </div>
          </div>

          {/* User Follow-up */}
          <div className="flex gap-4">
            <Avatar className="h-8 w-8 mt-1">
              <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                U
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <p className="text-sm text-foreground leading-relaxed">
                Let's add @ContextualizedFeaturedFeatures feature add
                generator.split() : Copy the same "occrWithFeatures" technical
                to add recoverRoots to the SplitTree backend.
              </p>
            </div>
          </div>

          {/* Another AI Response */}
          <div className="flex gap-4">
            <Avatar className="h-8 w-8 mt-1">
              <AvatarFallback className="bg-accent text-accent-foreground text-xs">
                AI
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="mb-3">
                <Badge variant="outline" className="gap-1.5 text-xs">
                  <Lightbulb className="h-3 w-3" />
                  Thinking
                </Badge>
              </div>
              <Card className="p-4 bg-muted/50 border-muted">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  I'll first look at the SplitTree Codable's implementation to
                  light after the recovery is BASIC, SplitTree Codable context,
                  then I will add a custom Codable implementation for the new
                  SplitTree layout context with the BASIC. SplitTree Codable
                  session implementation.
                </p>
              </Card>

              <div className="mt-4 space-y-2">
                <ToolCall icon="✓" status="completed" text="Updated TODOS" />
              </div>

              <div className="mt-4 space-y-3">
                <p className="text-sm text-foreground leading-relaxed">
                  Perfect! I can now use the SplitTree Codable's implementation
                  to light after the recovery is BASIC, Context, Now I read the
                  custom Codable implementation context with the BASIC,
                  SplitTree variant with the recovery.add and the variant.
                  Context and add in support for the new path to the node's
                  using the code name instead of the full code reference.
                </p>

                <p className="text-sm text-foreground leading-relaxed">
                  Then, after add the recovery is BASIC, Connected context to
                  Codable.
                </p>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Here is the code for Codable as this:
                  </p>

                  <ToolCall icon="○" status="running" text="Jig build" />
                </div>

                <p className="text-sm text-foreground leading-relaxed mt-4">
                  Perfect! I've successfully implemented the with proper
                  encoding. The changes include:
                </p>

                <ul className="text-sm text-foreground space-y-2 ml-4 list-disc">
                  <li>
                    Implementing a custom Codable conformance for the{" "}
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                      SplitTree
                    </code>
                  </li>
                  <li>
                    Removed the automatic Codable conformance from{" "}
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                      SplitTree
                    </code>{" "}
                    tree
                  </li>
                  <li>
                    Implementing custom{" "}
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                      Codable
                    </code>{" "}
                    for{" "}
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                      SplitTree
                    </code>{" "}
                    tree
                  </li>
                  <li>
                    Recursively encodes nodes in{" "}
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                      encode(to:)
                    </code>{" "}
                    method during decoding
                  </li>
                  <li>
                    Recursively encodes the context code have for a given
                    interest in the full code reference will be be longer inside
                    code inside but instances not become during during the path
                    to nodes in the reconstructed structures
                  </li>
                </ul>

                <p className="text-sm text-foreground leading-relaxed mt-4">
                  Thus fix the was where reconstructed become instead will be be
                  will be no will be longer during code inside but instances not
                  become during during the path to navigate to the correct node
                  in the reconstructed
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
