export type PullRequestEventAction =
  | "opened"
  | "reopened"
  | "synchronize"
  | "edited"
  | "ready_for_review";

export type PullRequestCommit = {
  commit: {
    message: string;
  };
};

export type PullRequestEventPayload = {
  action: string;
  installation?: { id?: number };
  repository: {
    name: string;
    owner: {
      login: string;
    };
  };
  pull_request: {
    number: number;
    state: string;
    body: string | null;
  };
};

export type PullRequestAddress = {
  owner: string;
  repo: string;
  pullNumber: number;
};
