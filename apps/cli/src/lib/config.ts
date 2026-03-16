import { homedir } from "os";
import { join } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";

const CONFIG_DIR = join(homedir(), ".open-vault");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export type AdapterType = "convex" | "s3" | "r2" | "local" | "postgres" | "mysql" | "redis";

export interface Config {
  adapter?: AdapterType;
  sshKeyPath?: string;
  userId?: string;

  // convex
  convexUrl?: string;

  // s3 / r2
  s3Bucket?: string;
  s3Region?: string;
  s3Prefix?: string;
  /** R2: https://{account-id}.r2.cloudflarestorage.com */
  s3Endpoint?: string;
  /** Explicit credentials — falls back to env vars / ~/.aws/credentials if omitted */
  s3AccessKeyId?: string;
  s3SecretAccessKey?: string;

  // local
  localPath?: string;

  // postgres / mysql
  databaseUrl?: string;

  // redis
  redisUrl?: string;
}

export function loadConfig(): Config {
  if (!existsSync(CONFIG_FILE)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
  } catch {
    return {};
  }
}

export function saveConfig(config: Config): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { encoding: "utf-8", mode: 0o600 });
}
