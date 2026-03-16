import { homedir } from "os";
import { join } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "fs";

const SESSION_DIR = join(homedir(), ".open-vault");
const SESSION_FILE = join(SESSION_DIR, "session.json");

export interface Session {
  token: string;
  userId: string;
  expiresAt: string;
}

export function loadSession(): Session | null {
  if (!existsSync(SESSION_FILE)) return null;
  try {
    const s = JSON.parse(readFileSync(SESSION_FILE, "utf-8")) as Session;
    if (new Date(s.expiresAt) < new Date()) {
      clearSession();
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function saveSession(session: Session): void {
  if (!existsSync(SESSION_DIR)) mkdirSync(SESSION_DIR, { recursive: true });
  writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2), { mode: 0o600 });
}

export function clearSession(): void {
  if (existsSync(SESSION_FILE)) unlinkSync(SESSION_FILE);
}
