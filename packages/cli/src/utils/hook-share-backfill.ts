import {
  backfillRecentHeadAgentSessionTrailer,
  type CommitBackfillResult,
} from "./commit-backfill.js";
import { removeAthrdUrlMarker } from "./marker.js";

interface MaybeBackfillHookDrivenCommitParams {
  cwd?: string;
  mark: boolean;
  hookPayloadJson?: string;
  url: string;
}

export function maybeBackfillHookDrivenCommit(
  params: MaybeBackfillHookDrivenCommitParams,
): CommitBackfillResult | null {
  if (!params.mark || !params.hookPayloadJson) {
    return null;
  }

  const result = backfillRecentHeadAgentSessionTrailer({
    cwd: params.cwd,
    url: params.url,
  });

  if (result.status === "applied") {
    removeAthrdUrlMarker({
      cwd: params.cwd,
      url: params.url,
    });
  }

  return result;
}
