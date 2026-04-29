interface ParseJsonlOptions {
  skipInvalid?: boolean;
}

export async function readTextFile(filePath: string): Promise<string> {
  return Bun.file(filePath).text();
}

export async function readJsonFile<T = unknown>(filePath: string): Promise<T> {
  return (await Bun.file(filePath).json()) as T;
}

export async function readJsonlFile<T = unknown>(
  filePath: string,
  options?: ParseJsonlOptions,
): Promise<T[]> {
  return parseJsonl<T>(await readTextFile(filePath), options);
}

export function parseJsonl<T = unknown>(
  content: string,
  options: ParseJsonlOptions = {},
): T[] {
  const rows = content.split(/\r?\n/).filter((line) => line.trim());
  if (rows.length === 0) {
    return [];
  }

  if (!options.skipInvalid) {
    return Bun.JSONL.parse(rows.join("\n")) as T[];
  }

  const entries: T[] = [];
  for (const row of rows) {
    try {
      entries.push(...(Bun.JSONL.parse(row) as T[]));
    } catch {
      // Provider discovery should tolerate corrupt historical rows.
    }
  }

  return entries;
}
