/**
 * PM2 process file — Al Aminn Info
 * --------------------------------
 * Rule 5c: PM2 reads `.env.config` with fs.readFileSync() and injects the
 * values into the process environment. We parse it ourselves (instead of
 * dotenv) so `$` inside passwords is preserved byte-for-byte — the whole
 * reason this project does not use `.env`.
 *
 * Deploy with:
 *   pm2 delete alaminn-info 2>/dev/null; pm2 start ecosystem.config.cjs; pm2 save
 * (Rule 9.6: never `pm2 restart` after a deploy — delete + start.)
 */
const fs = require("node:fs");
const path = require("node:path");

/** Minimal KEY=VALUE parser: no expansion, quotes stripped, `#` comments. */
function parseEnvConfig(file) {
  const out = {};
  const text = fs.readFileSync(file, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const envFile = path.join(__dirname, ".env.config");
const fileEnv = fs.existsSync(envFile) ? parseEnvConfig(envFile) : {};

// Real process env wins over the file (allows one-off overrides).
const inherited = {};
for (const [key, value] of Object.entries(fileEnv)) {
  if (process.env[key] === undefined) inherited[key] = value;
}

module.exports = {
  apps: [
    {
      name: "alaminn-info",
      // output: "standalone" — the build step copies .next/static and public
      // into .next/standalone.
      script: ".next/standalone/server.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "700M",
      kill_timeout: 10000,
      wait_ready: false,
      env: {
        ...inherited,
        NODE_ENV: "production",
        PORT: Number(inherited.PORT || process.env.PORT || 3056),
        // Bind all interfaces so Nginx (and arena previews) can reach it.
        HOSTNAME: "0.0.0.0",
      },
      error_file: "logs/pm2-error.log",
      out_file: "logs/pm2-out.log",
      merge_logs: true,
      time: true,
    },
  ],
};
