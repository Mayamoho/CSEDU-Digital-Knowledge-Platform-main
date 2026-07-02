# Deployment Steps for Server

## After each push, run these commands on the server:

```bash
cd ~/csedu-platform
./quick-update.sh
```

## Or manually:

```bash
cd ~/csedu-platform
git pull origin main
docker compose -f docker-compose.prod.yml build frontend
docker compose -f docker-compose.prod.yml up -d frontend nginx
```

## Check status:

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f frontend
```

## Access:
http://20.195.127.226:8080

---

## Completed Fixes:

### ✅ Step 1: Show/Hide Password Toggle (Commit: 44cc29c)
- Added eye icon to toggle password visibility
- Applied to both login and register pages
- Fixes DU_VibeCoders S-01 issue

**Test**: Go to login/register pages and click the eye icon

---

## Next Steps in Progress:

Will continue with remaining critical fixes after you deploy and confirm this works.
