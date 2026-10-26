// ────────────────────────────────────────────────────────────────
// deploy/ecosystem.pm2.cjs — PM2 ecosystem for versioned releases
//
// This ecosystem configures PM2 to run the ALAMINN standalone server
// for the live alaminn.info deployment.
// ────────────────────────────────────────────────────────────────

module.exports = {
  apps: [
    {
      name: "alaminn",
      cwd: "/var/www/alaminn-info/current",
      script: ".next/standalone/server.js",
      instances: "1",
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 3056,
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
