# Otix Server — REFERENCE ONLY (retired from the product path)

> **Django is the Otix node.** The product path lives in `../backend/`.
> This package (`otix_server`) is kept temporarily as a reference for Range
> streaming, indexer, and usenet helper behavior that was ported into
> `backend/apps/library/services/node_*.py`.
>
> Do **not** run this daemon in new environments. Compose no longer starts
> `storage-server`. Heartbeat / `UserGameServer` multi-node registration is gone.

Historical quick start below is for archaeology only.

---

## Legacy description

A lightweight, standalone, headless server daemon for hosting game installer
files and managing local save snapshots. Previously discovered via Django
heartbeat and proxied as `UserGameServer` rows.
