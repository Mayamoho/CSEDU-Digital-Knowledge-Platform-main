# Server Deployment Guide — CSEDU Digital Knowledge Platform

This guide deploys the platform on a shared Linux server
(`ip-lab-student-03`, IP `20.195.127.226`, user `azureuser`).

The app runs alongside other projects on the same VM. To be a good
neighbour, **this stack uses only ONE host port: 8080.**

(8089 and 8090 are already taken by other apps. Of the remaining
8080-8088, four teams share them — so we use exactly one.)

---

## 1. Port usage — just one

| External port | Service     | Purpose                              |
|---------------|-------------|--------------------------------------|
| **8080**      | **nginx**   | **Only entry point — web app + API** |

Everything else (postgres, redis, minio, rag, api, workers) lives on
the **internal Docker network** and is not reachable from the host
or other teams. You can still debug them by `exec`-ing into the
container from inside the VM.

```
Internet ──► Azure NSG (allows 8080-8090)
                  │
                  ▼
           host port 8080
                  │
                  ▼
           ┌──────────────────────────────┐
           │ nginx (csedu_nginx)          │
           │  /            → frontend    │
           │  /api/v1/ai/  → api         │
           │  /api/v1/     → api         │
           │  /_next/static → frontend   │
           └──────────────────────────────┘
                          │  internal Docker network only
            ┌─────────────┼──────────────┬───────────────┐
            ▼             ▼              ▼               ▼
      api (Go)     frontend (Next)   rag (Python)   postgres, redis,
      :8080         :3000            :8001          minio, workers
```

---

## 2. One-time server setup (per VM)

### 2.1 SSH into the VM

From your laptop:

```bash
ssh azureuser@20.195.127.226
# password: bMe2@6XgqvYNV8$wzQh7fL#s
```

### 2.2 Install Docker Engine + Compose plugin

Run this once on the VM. Pull it from the repo, or paste the contents
of `install-docker.sh`:

```bash
curl -fsSL https://raw.githubusercontent.com/Mayamoho/CSEDU-Digital-Knowledge-Platform-main/main/install-docker.sh -o install-docker.sh
chmod +x install-docker.sh
./install-docker.sh
```

**Log out and log back in** so the `docker` group membership takes effect:

```bash
exit                                  # close SSH session
ssh azureuser@20.195.127.226          # log in again
docker ps                             # should work without sudo
```

---

## 3. First-time deployment

### 3.1 Pull the project & configure secrets

```bash
cd ~
git clone https://github.com/Mayamoho/CSEDU-Digital-Knowledge-Platform-main.git csedu-platform
cd csedu-platform

cp .env.production .env
nano .env
```

In `.env`, replace every `CHANGE_ME_*` / `PUT_YOUR_*_KEY_HERE`:

- `DB_PASSWORD` — strong random password
- `MINIO_PASSWORD` — strong random password
- `JWT_SECRET` — generate with `openssl rand -hex 32`
- `GROQ_API_KEY` — your Groq API key
- `GEMINI_API_KEY` — your Gemini API key

Save and exit. **Do NOT commit `.env`.**

### 3.2 Run the deploy script

```bash
chmod +x deploy.sh
./deploy.sh
```

What it does:

1. Confirms Docker is installed.
2. Clones (or hard-resets to `origin/main`) into `~/csedu-platform`.
3. Creates `.env` from the template if missing.
4. Builds all images.
5. Starts the whole stack on the internal Docker network, exposing
   **only nginx on host port 8080**.
6. Waits for PostgreSQL to become healthy.
7. Prints the public URL.

First build: ~5-10 minutes. Later updates: seconds.

### 3.3 Verify

```bash
docker compose -f docker-compose.prod.yml ps        # all "Up" / "healthy"

curl -sI http://localhost:8080                     # 200 OK + HTML
curl -s  http://localhost:8080/api/v1/health        # JSON

# In any browser:
# http://20.195.127.226:8080
```

---

## 4. Updating the app (GitHub workflow)

After you push new commits from your laptop:

```bash
cd ~/csedu-platform
./deploy.sh
```

That's it. The script does `git reset --hard origin/main`, rebuilds
only what changed, and brings the stack back up. Your `.env` is
preserved (it lives outside Git).

---

## 5. Useful commands on the VM

The whole stack is reachable through **host port 8080 only**. For
debugging, exec into the relevant container — no host port needed:

```bash
cd ~/csedu-platform

# Live logs
docker compose -f docker-compose.prod.yml logs -f --tail=100
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f rag
docker compose -f docker-compose.prod.yml logs -f frontend

# Restart one service
docker compose -f docker-compose.prod.yml restart api

# Direct DB access (no host port needed)
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U csedu_user -d csedu_platform

# Redis CLI
docker compose -f docker-compose.prod.yml exec redis redis-cli

# MinIO admin
docker compose -f docker-compose.prod.yml exec minio \
  mc alias set local http://localhost:9000 minioadmin 'YOUR_PASSWORD'
docker compose -f docker-compose.prod.yml exec minio mc ls local/

# Shell in API container
docker compose -f docker-compose.prod.yml exec api sh

# Disk usage
docker system df

# Stop everything (data volumes preserved)
docker compose -f docker-compose.prod.yml down

# Stop everything AND wipe data (DESTRUCTIVE)
docker compose -f docker-compose.prod.yml down -v
```

---

## 6. Default logins (change immediately!)

```
Admin       : admin@cs.du.ac.bd        / Admin@12345
Librarian   : librarian@cs.du.ac.bd    / Librarian@12345
Researcher  : researcher@cs.du.ac.bd   / Research@12345
Student     : student@cs.du.ac.bd      / Student@12345
```

Log in and rotate every password from the admin panel.

---

## 7. Co-existing with other teams on the host

- This stack binds **only** to host port **8080**.
- Other teams' stacks on this VM should pick different ports from
  the 8081-8088 range (they have 8089 and 8090 too).
- The Docker network `csedu-platform_default` is private to this
  stack. Even if another team creates a `postgres` container, ours
  keeps talking to our own because Docker service names resolve
  inside the project's network only.
- Volume names are prefixed `csedu-platform_*`, so they won't clash.

If a port collision ever happens (e.g. someone else takes 8080):

```bash
# Find what's on 8080
sudo ss -tlnp | grep ':8080'

# If you must move, edit the SINGLE line in docker-compose.prod.yml:
#   ports:
#     - "8080:80"   ← change the left side, e.g. "8081:80"
# Then rerun ./deploy.sh
```

---

## 8. Troubleshooting

### "port is already allocated"

```bash
sudo ss -tlnp | grep ':8080'
```

If something else is on 8080, change the left side of the `8080:80`
mapping in `docker-compose.prod.yml` and rerun `./deploy.sh`.

### Containers keep restarting

```bash
docker compose -f docker-compose.prod.yml logs api
docker compose -f docker-compose.prod.yml logs postgres
```

Common causes: weak `JWT_SECRET`, wrong DB password, missing
Groq/Gemini key.

### Database won't initialise

Init SQL only runs on a fresh data volume. If you changed
`infra/db/*.sql`, wipe the volume:

```bash
docker compose -f docker-compose.prod.yml down
docker volume rm csedu-platform_postgres_data
./deploy.sh
```

### Out of disk / RAM

```bash
docker system prune -af        # removes stopped containers + dangling images
docker volume prune            # removes unused volumes (CAREFUL)
free -h                        # RAM usage
```

The VM has 4 GiB RAM. The full stack needs ~2.5 GiB. If another
project is using lots of RAM the API may OOM.

---

## 9. Files added for deployment

| File                          | Purpose                                          |
|-------------------------------|--------------------------------------------------|
| `docker-compose.prod.yml`     | Production compose — only port 8080 exposed      |
| `.env.production`             | `.env` template — copy on VM and fill secrets    |
| `deploy.sh`                   | One-command deploy / update from GitHub          |
| `install-docker.sh`           | One-time Docker install on a fresh Ubuntu VM     |
| `SERVER_DEPLOY.md`            | This document                                    |
| `Dockerfile`                  | Frontend image (Next.js standalone)              |
| `api/Dockerfile`              | Go API image                                     |
| `api/Dockerfile.worker`       | Ingestion worker image                           |
| `api/Dockerfile.fineworker`   | Fine worker image                                |
| `rag/Dockerfile`              | Python RAG service image                         |
| `infra/nginx/nginx.conf`      | Nginx routing (frontend + api reverse proxy)     |