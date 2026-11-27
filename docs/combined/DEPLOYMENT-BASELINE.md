# Deployment baseline (repository only)

`deploy/alaminn-info.service` and `deploy/nginx-alaminn-info.conf` target port 3056; `Caddyfile` targets 3000 and has stale comments. `server.js` wraps Next standalone, while the systemd file directly launches the standalone artifact. Docker, PM2, Nginx and Caddy examples coexist. The actual live topology, reverse proxy trust boundary, host operating system, secrets, TLS, production data and backups have not been verified. Do not deploy or change live services based on these examples without owner-authorized discovery and staging.
