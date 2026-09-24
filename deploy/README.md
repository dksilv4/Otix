# Deployment

All deployment-related configs and scripts live here or at the repo root.

---

## Development
```bash
make dev          # Starts full dev stack via docker-compose.yml
make up / down    # Start/stop without log tailing
```

---

## Production — Docker Compose
```bash
make prod-up      # docker-compose.prod.yml — full production stack
make prod-down
```
The production stack adds PgBouncer (connection pooling), nginx (frontend),
and hardened resource limits. Configure via `.env` (see `.env.example`).

---

## Production — VM Bootstrap
**`deploy/bootstrap-api-vm.sh`** — one-shot script to provision a fresh Ubuntu VM
(tested on Oracle Always Free Ampere). Installs Docker, clones the repo, generates
`.env`, and starts `docker-compose.api.yml` (API-only, no frontend).

---

## Plugin Host Service
**`deploy/plugin-host/`** — systemd and Supervisor configs for running the
Django plugin host process as a persistent system service (used when deploying
the plugin IPC server outside of Docker).

| File | Purpose |
|---|---|
| `plugin-host.service` | systemd unit file |
| `plugin-host.supervisor.conf` | Supervisor program config |
