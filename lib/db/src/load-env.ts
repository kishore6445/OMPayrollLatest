import fs from "fs";
import path from "path";

/**
 * Minimal .env loader for local (non-Replit) development.
 * Walks up from the current working directory looking for a `.env` file
 * and populates any variables that are not already set in the process
 * environment. On Replit, env vars are injected by the platform, so this
 * is a no-op there.
 */
export function loadDotEnv(): void {
  if (process.env.DATABASE_URL) return;

  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, ".env");
    if (fs.existsSync(candidate)) {
      const content = fs.readFileSync(candidate, "utf8");
      for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;
        const eq = line.indexOf("=");
        if (eq <= 0) continue;
        const key = line.slice(0, eq).trim();
        let value = line.slice(eq + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (process.env[key] === undefined) {
          process.env[key] = value;
        }
      }
      return;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}
