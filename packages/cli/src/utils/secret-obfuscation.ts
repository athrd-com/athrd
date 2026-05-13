export const SECRET_MASK = "********";

export interface SecretObfuscationResult {
  content: string;
  redactionCount: number;
}

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

interface ObfuscateValueResult {
  value: JsonValue;
  redactionCount: number;
}

const TOKEN_COUNT_KEY_PATTERN =
  /^(?:(?:input|output|prompt|completion|cached|total|reasoning)_)?tokens?(?:_count)?$/;

const NON_SECRET_KEY_PATTERN =
  /^(?:token_count|tokens_count|input_tokens|output_tokens|prompt_tokens|completion_tokens|cached_tokens|total_tokens|reasoning_tokens|key|public_key)$/;

const SECRET_KEY_COMPACT_PATTERNS = [
  "apikey",
  "authkey",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "sessiontoken",
  "clientsecret",
  "webhooksecret",
  "signingsecret",
  "privatekey",
  "secretkey",
  "accesskey",
  "databaseurl",
  "postgresurl",
  "postgresqlurl",
  "mysqlurl",
  "redisurl",
  "mongodburi",
  "mongoaturi",
  "connectionstring",
];

const SECRET_KEY_WORDS = new Set([
  "authorization",
  "credential",
  "credentials",
  "jwt",
  "passwd",
  "password",
  "pwd",
  "secret",
  "token",
]);

const KNOWN_SECRET_VALUE_PATTERNS = [
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bgh[opsru]_[A-Za-z0-9_]{20,}\b/g,
  /\bsk-(?:proj-|ant-|ant-api\d+-)?[A-Za-z0-9_-]{20,}\b/g,
  /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bASIA[0-9A-Z]{16}\b/g,
  /\bAIza[0-9A-Za-z_-]{35}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  /\bnpm_[A-Za-z0-9]{20,}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
];

const PRIVATE_KEY_BLOCK_PATTERN =
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g;

const URL_CREDENTIAL_PATTERN =
  /\b([a-z][a-z0-9+.-]*:\/\/)([^/\s:@]+):([^/\s@]+)@/gi;

const AUTH_HEADER_PATTERN =
  /\b(Authorization\s*[:=]\s*)(Bearer|Basic|Token)\s+([A-Za-z0-9._~+/=-]{12,})/gi;

const BEARER_TOKEN_PATTERN =
  /\b(Bearer|Basic|Token)\s+([A-Za-z0-9._~+/=-]{20,})/gi;

const QUOTED_ASSIGNMENT_PATTERN =
  /\b([A-Za-z_][A-Za-z0-9_.-]{1,80})(\s*[:=]\s*)(["'])([^"'\r\n]{3,})\3/g;

const UNQUOTED_ASSIGNMENT_PATTERN =
  /\b([A-Za-z_][A-Za-z0-9_.-]{1,80})(\s*[:=]\s*)([^\s,;'"`]{8,})/g;

export function obfuscateSessionContent(
  content: string,
  format: "json" | "jsonl",
): SecretObfuscationResult {
  try {
    if (format === "json") {
      const parsed = JSON.parse(content) as JsonValue;
      const result = obfuscateJsonValue(parsed);
      return {
        content: `${JSON.stringify(result.value, null, 2)}\n`,
        redactionCount: result.redactionCount,
      };
    }

    const sourceRows = content.split(/\r?\n/).filter((line) => line.trim());
    const outputRows: string[] = [];
    let redactionCount = 0;

    for (const row of sourceRows) {
      const parsed = JSON.parse(row) as JsonValue;
      const result = obfuscateJsonValue(parsed);
      redactionCount += result.redactionCount;
      outputRows.push(JSON.stringify(result.value));
    }

    return {
      content: `${outputRows.join("\n")}\n`,
      redactionCount,
    };
  } catch {
    return obfuscateText(content);
  }
}

function obfuscateJsonValue(
  value: JsonValue,
  keyName?: string,
): ObfuscateValueResult {
  if (keyName && isSecretKeyName(keyName) && value !== null) {
    return {
      value: SECRET_MASK,
      redactionCount: 1,
    };
  }

  if (typeof value === "string") {
    const result = obfuscateText(value);
    return {
      value: result.content,
      redactionCount: result.redactionCount,
    };
  }

  if (Array.isArray(value)) {
    let redactionCount = 0;
    const values = value.map((item) => {
      const result = obfuscateJsonValue(item);
      redactionCount += result.redactionCount;
      return result.value;
    });

    return { value: values, redactionCount };
  }

  if (value && typeof value === "object") {
    let redactionCount = 0;
    const record: { [key: string]: JsonValue } = {};

    for (const [key, nestedValue] of Object.entries(value)) {
      const result = obfuscateJsonValue(nestedValue, key);
      redactionCount += result.redactionCount;
      record[key] = result.value;
    }

    return { value: record, redactionCount };
  }

  return { value, redactionCount: 0 };
}

export function obfuscateText(content: string): SecretObfuscationResult {
  let redactionCount = 0;
  let output = content.replace(PRIVATE_KEY_BLOCK_PATTERN, () => {
    redactionCount++;
    return SECRET_MASK;
  });

  output = output.replace(
    AUTH_HEADER_PATTERN,
    (_match, prefix: string, scheme: string) => {
      redactionCount++;
      return `${prefix}${scheme} ${SECRET_MASK}`;
    },
  );

  output = output.replace(
    QUOTED_ASSIGNMENT_PATTERN,
    (
      match: string,
      key: string,
      separator: string,
      quote: string,
      value: string,
    ) => {
      if (!isSecretKeyName(key) || value === SECRET_MASK) {
        return match;
      }

      redactionCount++;
      return `${key}${separator}${quote}${SECRET_MASK}${quote}`;
    },
  );

  output = output.replace(
    UNQUOTED_ASSIGNMENT_PATTERN,
    (match: string, key: string, separator: string, value: string) => {
      if (!isSecretKeyName(key) || value === SECRET_MASK) {
        return match;
      }

      redactionCount++;
      return `${key}${separator}${SECRET_MASK}`;
    },
  );

  output = output.replace(
    URL_CREDENTIAL_PATTERN,
    (_match, protocol: string) => {
      redactionCount++;
      return `${protocol}${SECRET_MASK}@`;
    },
  );

  output = output.replace(
    BEARER_TOKEN_PATTERN,
    (match: string, scheme: string, token: string) => {
      if (token === SECRET_MASK) {
        return match;
      }

      redactionCount++;
      return `${scheme} ${SECRET_MASK}`;
    },
  );

  for (const pattern of KNOWN_SECRET_VALUE_PATTERNS) {
    output = output.replace(pattern, (match) => {
      if (match === SECRET_MASK) {
        return match;
      }

      redactionCount++;
      return SECRET_MASK;
    });
  }

  return {
    content: output,
    redactionCount,
  };
}

function isSecretKeyName(key: string): boolean {
  const normalized = normalizeKeyName(key);
  if (!normalized || NON_SECRET_KEY_PATTERN.test(normalized)) {
    return false;
  }

  if (TOKEN_COUNT_KEY_PATTERN.test(normalized)) {
    return false;
  }

  const compact = normalized.replace(/_/g, "");
  if (SECRET_KEY_COMPACT_PATTERNS.some((pattern) => compact.includes(pattern))) {
    return true;
  }

  return normalized.split("_").some((word) => SECRET_KEY_WORDS.has(word));
}

function normalizeKeyName(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}
