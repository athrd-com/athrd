import type { AThrd } from "@/types/athrd";
import type { IDE } from "@/types/ide";

/**
 * Base interface for all thread parsers.
 * Each parser converts a specific CLI tool's thread format into the unified AThrd format.
 */
export interface Parser<T = unknown> {
  /** The IDE identifier this parser handles */
  readonly id: IDE;

  /**
   * Parse a raw thread into the unified AThrd format.
   * @param rawThread - The raw thread data from the CLI tool
   * @returns The parsed AThrd thread
   */
  parse(rawThread: T): AThrd;

  /**
   * Check if this parser can handle the given raw thread.
   * Used for auto-detection when IDE is not explicitly specified.
   * @param rawThread - The raw thread data to check
   * @returns true if this parser can handle the thread
   */
  canParse(rawThread: unknown): rawThread is T;
}
