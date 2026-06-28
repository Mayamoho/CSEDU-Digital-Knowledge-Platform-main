#!/bin/bash
# ============================================================
# CSEDU Digital Knowledge Platform — Server Deployment Script
# Run on the Azure VM (ip-lab-student-03, 20.195.127.226).
# Pulls the latest code from GitHub and starts the production
# stack defined in docker-compose.prod.yml.
# ============================================================
set -e

# --- Configuration -------------------------------------------------
REPO_URL="https://github.com/Mayamoho/CSEDU-Digital-Knowledge-Platform-main.git"
APP_DIR="$HOME/csedu-platform"
BRANCH="main"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env"

# --- Helpers -------------------------------------------------------
log() { echo -e "\033[1;34m[deploy]\033[0m $*"; }
err() { echo -e "\033[1;31m[error]\033[0m $*" >&2; }

# --- 1. Sanity checks ----------------------------------------------
log "Sanity checks..."
if ! command -v docker >/dev/null 2>&1; then
    err "Docker is not installed. Run install-docker.sh first."
    exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
    err "Docker Compose plugin not found."
    exit 1
fi

# --- 2. Clone or update the repository ----------------------------
if [ ! -d "$APP_DIR/.git" ]; then
    log "Cloning repository into $APP_DIR ..."
    rm -rf "$APP_DIR"
    git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
else
    log "Updating existing repository at $APP_DIR ..."
    cd "$APP_DIR"
    git fetch origin
    # Reset to origin/BRANCH so any local dirt is discarded — safe
    # because all runtime config lives in the .env file outside Git.
    git reset --hard "origin/$BRANCH"
    git clean -fdx -e "$ENV_FILE"
fi

cd "$APP_DIR"

# --- 3. Ensure .env exists ---------------------------------------
if [ ! -f "$ENV_FILE" ]; then
    if [ -f ".env.production" ]; then
        log "Creating .env from .env.production template..."
        cp .env.production "$ENV_FILE"
        err "!! IMPORTANT: edit $APP_DIR/$ENV_FILE and replace the"
        err "   CHANGE_ME_* placeholders with real secrets before"
        err "   starting the app for the first time."
        exit 1
    else
        err ".env file missing and no .env.production template found."
        exit 1
    fi
fi

# --- 4. Build images SEQUENTIALLY (parallel build OOMs 4 GiB VMs) -
# Building all five images at once made the system hang by trying
# to keep several heavy compilers in RAM at the same time. Build one
# image at a time so RAM is reused, not duplicated.
log "Building images SEQUENTIALLY — this avoids OOM on small VMs."
log "(first run takes 5-15 minutes, later runs are near-instant)"

# Available RAM check — warn the user, do not abort.
if command -v free >/dev/null 2>&1; then
    TOTAL_RAM_MB=$(free -m | awk '/^Mem:/ {print $2}')
    log "Detected RAM: ${TOTAL_RAM_MB} MiB"
    if [ "${TOTAL_RAM_MB:-0}" -lt 6000 ]; then
        log "  WARNING: <6 GiB RAM. If the build hangs or fails with"
        log "  'Cannot connect to Docker daemon', add swap first:"
        log "    sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile"
        log "    sudo mkswap /swapfile && sudo swapon /swapfile"
    fi
fi

# Order matters: lightweight first so the heaviest compile is done
# when the most RAM is free.
#
# rag + ingestion-worker are SKIPPED on this 4 GiB VM — they pull
# Python + a 500 MB embedding model and OOM even with swap. The app
# runs fine without them; AI chat endpoints will return errors but
# the rest of the platform (library, catalog, projects, fines)
# still works. To re-enable later, remove the leading underscore
# in docker-compose.prod.yml and add rag and ingestion-worker back
# to BUILD_ORDER below.
BUILD_ORDER=(postgres redis minio frontend api fine-worker)
for svc in "${BUILD_ORDER[@]}"; do
    log "Building: $svc ..."
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build "$svc"
done

# --- 5. Start the stack -------------------------------------------
log "Starting services..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

# --- 6. Wait for database & show status ---------------------------
log "Waiting for database to become healthy..."
for i in $(seq 1 30); do
    if docker compose -f "$COMPOSE_FILE" exec -T postgres \
            pg_isready -U "${DB_USER:-csedu_user}" \
                       -d "${DB_NAME:-csedu_platform}" >/dev/null 2>&1; then
        break
    fi
    sleep 2
done

log "Running service status:"
docker compose -f "$COMPOSE_FILE" ps

# --- 7. Print URLs -----------------------------------------------
PUBLIC_IP="20.195.127.226"
cat <<EOF

================================================================
  Deployment complete!
================================================================
  ONLY ONE HOST PORT IS USED: 8080
  Web app + API  : http://${PUBLIC_IP}:8080
                   (Nginx proxies /api/v1/* to the api container
                    and / to the Next.js frontend — both on the
                    internal Docker network)
================================================================
  To debug services locally from the VM, exec into the container:
      docker compose -f $COMPOSE_FILE exec postgres psql -U \$DB_USER -d \$DB_NAME
      docker compose -f $COMPOSE_FILE exec redis redis-cli
      docker compose -f $COMPOSE_FILE exec minio mc ls local/
================================================================
  To redeploy after a git push, just re-run this script:
      ./deploy.sh
================================================================
EOF