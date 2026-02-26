const requiredEnv = [
  "GITHUB_APP_ID",
  "GITHUB_PRIVATE_KEY",
  "GITHUB_WEBHOOK_SECRET",
] as const;

export type AppEnv = {
  appId: string;
  privateKey: string;
  webhookSecret: string;
  port: number;
  logLevel: string;
};

export function readEnv(): AppEnv {
  for (const key of requiredEnv) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  return {
    appId: process.env.GITHUB_APP_ID as string,
    privateKey: (process.env.GITHUB_PRIVATE_KEY as string).replace(/\\n/g, "\n"),
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET as string,
    port: Number(process.env.PORT ?? "3000"),
    logLevel: process.env.LOG_LEVEL ?? "info",
  };
}
