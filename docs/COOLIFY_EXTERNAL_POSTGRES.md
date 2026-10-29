# Coolify: Paddy + external PostgreSQL service

Use this when the in-compose Postgres hits IPv6 / auth weirdness on Coolify.

## 1. Create the database (Coolify)

1. **+ New** → **Database** → **PostgreSQL**
2. **Docker image** must be **`pgvector/pgvector:pg17`**  
   (default `postgres` image will fail migrate: `CREATE EXTENSION vector`)
3. Set user / password / database (e.g. `paddy` / strong password / `paddy`)
4. Deploy the database. Copy **`DATABASE_URL`** from the DB resource  
   (looks like `postgresql://paddy:…@xxxxxxxx:5432/paddy`)

URL tips:
- Prefer letters+digits in the password (or URL-encode specials).
- Host must be the Coolify DB container hostname (not `localhost`, not `postgres` from the old compose).

## 2. Point the app at it

1. App resource → Compose file: **`docker-compose.coolify.yml`**
2. Environment:
   - **`DATABASE_URL`** = paste from step 1 (required)
   - **`AUTH_SECRET`**, **`APP_URL=https://your-domain`**
   - AI + email vars as before
3. Remove old in-compose DB envs if present (`POSTGRES_PASSWORD`, etc.) — unused now.
4. Map domain → service **`web`**, port **3000**.
5. Redeploy.

You can stop/delete the old in-stack `postgres-*` containers and volumes  
`…_paddy-pgdata` — they are no longer used.

## 3. Verify

```bash
# migrate should exit 0
docker ps -a --filter name=migrate- --format '{{.Names}} {{.Status}}'

# from web
docker exec $(docker ps -aq --filter name=web- | head -1) node -e '
const {PrismaClient}=require("@prisma/client");
const p=new PrismaClient();
p.$queryRaw`SELECT 1`.then(r=>{console.log("ok",r);process.exit(0)})
 .catch(e=>{console.error(e.message);process.exit(1)});
'
```

Health: `https://your-domain/api/health` → `"status":"healthy"`.
