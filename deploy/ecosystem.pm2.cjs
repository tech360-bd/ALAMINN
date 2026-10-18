// ─────────────────────────────────────────────────────────────────
// deploy/ecosystem.pm2.cjs — PM2 ecosystem for versioned releases
//
// This ecosystem configures PM2 to run the ALAMINN standalone server
// from versioned release directories. It is designed for deployment via
// GitHub Actions → Tailscale SSH → PM2.
//
// START:
//   pm2 start deploy/ecosystem.pm2.cjs --env production
//   pm2 save && pm2 startup
//
// DEPLOY (new release):
//   1. Create release directory
//   2. Build the app in the release directory
//   3. Switch symlink: ln -sfn new-release current
//   4. pm2 reload alaminn-info --update-no-deps
//
// SAFETY:
//   - Single instance — Next.js standalone handles concurrency internally
//   - Graceful shutdown with kill_timeout
//   - No watch mode in production
//   - Persistent logs in /var/www/alaminn-info/logs/
// ─────────────────────────────────────────────────────────────────

module.exports = {
  apps: [
    {
      name: "alaminn-info",
      cwd: "/var/www/alaminn-info/current",
      script: ".next/standalone/server.js",
      instances: "1",
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 3001,
        NODE_OPTIONS: "--max-old-space-size=512",
      },
      env_file: ".env",
      // ── Restart policy ──────────────────────────────────────
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 5000,
      max_memory_restart: "768M",
      // ── Logs ────────────────────────────────────────────────
      out_file: "/var/www/alaminn-info/logs/out.log",
      error_file: "/var/www/alaminn-info/logs/error.log",
      merge_logs: true,
      time: true,
      // ── Graceful shutdown ───────────────────────────────────
      kill_timeout: 5000,
      listen_timeout: 10000,
      watch: false,
    },
  ],
};
