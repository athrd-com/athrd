import { ChatProvider } from "./base.js";
import { ChatSession } from "../types/index.js";

export class CursorProvider implements ChatProvider {
    readonly id = "cursor";
    readonly name = "Cursor";

    async findSessions(): Promise<ChatSession[]> {
        // Cursor typically stores data in a similar location
        // const workspaceStoragePath = path.join(
        //   os.homedir(),
        //   "Library/Application Support/Cursor/User/workspaceStorage"
        // );

        return [];
    }

    async parseSession(session: ChatSession): Promise<any> {
        throw new Error("Not implemented");
    }
}
