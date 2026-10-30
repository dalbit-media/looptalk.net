# Server installation and scaling guide

This guide covers two things:

1. **Tier 1 (works today):** a step-by-step production install on one server.
2. **Tiers 2 and 3 (target architecture):** what is required to serve up to
   100 million registered users, including the code changes that are **not yet
   implemented**.

> **Read this first.** The current server is a single-node design: SQLite
> (`DATABASE_URL` must be a `file:` URL, enforced in
> `server/src/config/environment.js`), uploads on local disk, and several
> in-memory stores. It cannot serve 100 million users as shipped. Tier 1 is a
> realistic fit for up to roughly a few hundred thousand registered users, and
> the numbers in Tiers 2 and 3 are planning estimates that must be confirmed
> with load tests before launch.

## 1. Capacity model for 100 million users

All figures are assumptions to size hardware. Replace them with measured values.

| Assumption | Value | Result |
| --- | --- | --- |
| Registered users | 100,000,000 | |
| Daily active users (20%) | 20,000,000 | |
| Peak concurrent sockets (about 15% of DAU) | | ~3,000,000 |
| Messages per active user per day | 40 | ~800M/day, ~9,300/s average |
| Peak factor | 3x | ~28,000 messages/s |
| Socket.io node (8 vCPU, 16 GB, tuned) | 30,000 to 40,000 sockets | 80 to 100 nodes |
| Account row, with encrypted vault | 5 to 20 KB | 0.5 to 2 TB, before indexes and replicas |

Because messages and attachments are end-to-end encrypted and the server
deletes ciphertext once every device confirms storage, the message table is a
transient queue, not an archive. Long-term storage is dominated by accounts,
vaults, contacts, invitations and uploads.

## 2. Reference architecture (100 million users)

```text
Clients (iOS, Android, web)
        |
   CDN / WAF  (static web app, uploads, DDoS and bot protection)
        |
   L7 load balancer  (TLS, WebSocket aware, health checks on /ready)
        |
   +----+-----------------------------+
   |                                  |
 API + Socket.io pods (80-100)    Worker pods (push, cleanup)
   |         |        |                |
   |         |        +-- Redis Cluster (Socket.io adapter, rate limits,
   |         |            login challenges, pending calls, queues)
   |         +----------- Object storage (S3-compatible) for uploads
   |
 PostgreSQL, sharded by user id (primary + 2 replicas per shard)
        |
 Coturn fleet (TURN, UDP/TCP/TLS) behind geo DNS
```

Recommended components and sizing for the full target:

| Layer | Recommendation |
| --- | --- |
| App pods | 80 to 100 x 8 vCPU / 16 GB, autoscaled on connected sockets and CPU, across 3 zones |
| Load balancer | Managed L7 (AWS ALB or NLB, GCP HTTPS LB), idle timeout of at least 120 s for WebSockets, sticky sessions not required with the Redis adapter |
| Database | PostgreSQL 16, managed (RDS, Aurora, Cloud SQL, AlloyDB), 8 to 16 shards, each 16 vCPU / 64 GB / NVMe, 1 primary + 2 replicas, PgBouncer in front |
| Redis | Managed Redis Cluster, 6 shards x 3 nodes, 16 GB each, TLS enabled |
| Object storage | S3-compatible bucket with lifecycle rules, served through the CDN |
| TURN | 10 to 20 Coturn nodes (4 vCPU, 8 GB, public IP, 1 to 10 Gbps), regional |
| Observability | Sentry (already integrated), Prometheus + Grafana, centralized logs |
| Secrets | Cloud secret manager for `JWT_SECRET`, `USER_DATA_ENCRYPTION_KEY`, VAPID keys |

## 3. Required code changes before Tier 2 or 3

None of these exist in the repository today. They are the blockers for scaling
past one node:

1. **PostgreSQL instead of SQLite.** Change `datasource db` to `postgresql` in
   `server/prisma/schema.prisma`, relax the `file:` check in
   `server/src/config/environment.js`, and replace `prisma db push` in
   `server/scripts/start.js` with versioned `prisma migrate deploy`. Review
   queries for pagination and index use. Add a connection pooler (PgBouncer) and
   set Prisma `connection_limit` per pod.
2. **Sharding.** Route users to a shard by the opaque user id (`u_<32 hex>`).
   Keep conversation and message rows on the shard of the conversation owner, or
   adopt a distributed SQL database (CockroachDB, YugabyteDB, Citus) to avoid
   application-level sharding.
3. **Move in-memory state to Redis.** These are per-process `Map`s and break
   behind more than one pod: login challenges
   (`server/src/routes/privateAuth.js`), private invitation issuance counters
   (`server/src/routes/invitations.js`), Apple/Google signing-key cache
   (`server/src/utils/socialIdentity.js`), and the default in-memory
   `express-rate-limit` stores. Use a Redis-backed rate-limit store.
4. **Object storage for uploads.** `UPLOAD_DIR` is local disk
   (`server/src/utils/uploadStorage.js`). Use pre-signed S3 uploads and CDN
   delivery.
5. **Socket.io on Redis.** Already supported: set `REDIS_URL` and
   `INSTANCE_COUNT` (the server refuses to start with `INSTANCE_COUNT > 1`
   unless `REDIS_URL` is set). Use Redis Cluster in production.
6. **Push workers.** Move Expo and Web Push fan-out out of the request path into
   a queue with retry and dead-letter handling.
7. **Admin and analytics endpoints.** The invitation map and traffic views read
   whole graphs in memory; precompute them offline for large datasets.
8. **Load testing.** Validate the estimates in section 1 with a WebSocket load
   tool before opening signups.

## 4. Tier 1: single-server production install (supported today)

Recommended machine: **8 vCPU, 32 GB RAM, 500 GB NVMe SSD**, Ubuntu 24.04 LTS,
a static public IP and a DNS name (this guide uses `looptalk.example.com`).
Open inbound ports 80, 443, 3478 (TCP/UDP), 5349 (TCP), and 49152-65535 (UDP) for
TURN. Do not expose 3001.

### 4.1 System preparation

```sh
sudo apt update && sudo apt -y upgrade
sudo apt -y install nginx certbot python3-certbot-nginx coturn ufw git build-essential
sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp
sudo ufw allow 3478/tcp && sudo ufw allow 3478/udp && sudo ufw allow 5349/tcp
sudo ufw allow 49152:65535/udp && sudo ufw enable
sudo useradd --system --create-home --shell /usr/sbin/nologin looptalk
sudo mkdir -p /srv/looptalk/data/uploads /srv/looptalk/backups
sudo chown -R looptalk:looptalk /srv/looptalk
```

### 4.2 Node.js 22

```sh
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt -y install nodejs
node --version   # v22.x
```

### 4.3 Get the code and build

```sh
sudo -u looptalk git clone https://github.com/dalbit-media/looptalk.net /srv/looptalk/app
cd /srv/looptalk/app
sudo -u looptalk npm ci
sudo -u looptalk npm ci --prefix server
sudo -u looptalk npm ci --prefix mobile
sudo -u looptalk npm run release:prepare
```

### 4.4 Configure the server

Create `/srv/looptalk/app/server/.env` (mode `600`, owner `looptalk`):

```sh
DATABASE_URL="file:/srv/looptalk/data/looptalk.db"
UPLOAD_DIR=/srv/looptalk/data/uploads
PORT=3001
HOST=127.0.0.1
JWT_SECRET="<output of: openssl rand -base64 48>"
USER_DATA_ENCRYPTION_KEY="<output of: openssl rand -base64 32>"
INSTANCE_COUNT=1
TRUST_PROXY=1
WEB_CLIENT_URL="/app/"
RELEASE_VERSION="1.0.0"
SENTRY_DSN=""
ADMIN_USER_IDS=""

# Web push (generate once: npx web-push generate-vapid-keys)
VAPID_PUBLIC_KEY=""
VAPID_PRIVATE_KEY=""
VAPID_SUBJECT="mailto:ops@example.com"

# Apple/Google sign-in, used only for account recovery
GOOGLE_CLIENT_IDS=""
APPLE_CLIENT_IDS=""

# TURN
TURN_URLS="turn:looptalk.example.com:3478?transport=udp,turns:looptalk.example.com:5349?transport=tcp"
TURN_SECRET="<output of: openssl rand -hex 32>"
```

`TRUST_PROXY` is the number of proxy hops in front of the app (1 for nginx; 2 for a CDN plus a load balancer). Without it, rate limits see every client as the proxy address.

Back up `JWT_SECRET`, `USER_DATA_ENCRYPTION_KEY` and the VAPID pair in a secret
manager. Losing or rotating `USER_DATA_ENCRYPTION_KEY` makes encrypted contact
lookups unreadable, and changing the VAPID pair invalidates every browser push
subscription.

### 4.5 Run as a service

`/etc/systemd/system/looptalk.service`:

```ini
[Unit]
Description=LoopTalk server
After=network.target

[Service]
User=looptalk
WorkingDirectory=/srv/looptalk/app
Environment=NODE_ENV=production
ExecStart=/usr/bin/node server/scripts/start.js
Restart=always
RestartSec=3
LimitNOFILE=1048576
NoNewPrivileges=true
ProtectSystem=full
ReadWritePaths=/srv/looptalk

[Install]
WantedBy=multi-user.target
```

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now looptalk
curl -fsS http://127.0.0.1:3001/ready
```

### 4.6 HTTPS reverse proxy

`/etc/nginx/sites-available/looptalk`:

```nginx
server {
  listen 80;
  server_name looptalk.example.com;
  location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 3600s;
    client_max_body_size 100m;
  }
}
```

```sh
sudo ln -s /etc/nginx/sites-available/looptalk /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d looptalk.example.com
```

Raise connection limits for many WebSockets in `/etc/sysctl.d/99-looptalk.conf`
(`net.core.somaxconn=4096`, `net.ipv4.ip_local_port_range=1024 65535`,
`fs.file-max=2097152`) and in nginx (`worker_rlimit_nofile 262144;` and
`worker_connections 65535;`), then `sudo sysctl --system`.

### 4.6.1 Coturn

Set in `/etc/turnserver.conf`: `use-auth-secret`, `static-auth-secret=<TURN_SECRET>`,
`realm=looptalk.example.com`, `listening-port=3478`, `tls-listening-port=5349`,
`cert`/`pkey` pointing at the Let's Encrypt files, `min-port=49152`,
`max-port=65535`, `no-cli`. Enable it with `TURNSERVER_ENABLED=1` in
`/etc/default/coturn`, then `sudo systemctl enable --now coturn`.

### 4.7 Backups

SQLite lives in one file, so back it up continuously. Either stream it with
[Litestream](https://litestream.io) to S3-compatible storage, or take a nightly
consistent snapshot:

```sh
sqlite3 /srv/looptalk/data/looptalk.db ".backup '/srv/looptalk/backups/looptalk-$(date +%F).db'"
```

Also back up `/srv/looptalk/data/uploads`, and test a restore before launch.

### 4.8 Updates

```sh
cd /srv/looptalk/app && sudo -u looptalk git pull
sudo -u looptalk npm ci && sudo -u looptalk npm ci --prefix server && sudo -u looptalk npm ci --prefix mobile
sudo -u looptalk npm run release:prepare
sudo systemctl restart looptalk && curl -fsS http://127.0.0.1:3001/ready
```

Startup runs `prisma db push`, which applies only additive changes (new tables,
columns with defaults, indexes) and refuses destructive ones without
`--accept-data-loss`. Before each push, `server/scripts/start.js` writes a
consistent snapshot next to the database (`<db>.pre-migrate-<timestamp>`, last
three kept; set `SKIP_DB_SNAPSHOT=1` to disable). The current release is purely
additive: existing accounts get `isMember = true`, so current users stay full
members, and the new forum tables start empty.

Rollback: `sudo systemctl stop looptalk`, copy the newest snapshot over the
database file, check out the previous release, then start the service. Roll the
server out before (or together with) the web app; older mobile and web clients
keep working because every new API field is optional and unknown `member` values
are treated as members.

### 4.9 Verify

Run `curl https://looptalk.example.com/health`, sign up in the web app at `/app`,
send a message between two browsers, and place a test call over a mobile network
to confirm TURN works.

## 5. Tier 2: multi-node (after the section 3 changes)

Target: a few million registered users, ~100,000 concurrent sockets.

1. Provision managed PostgreSQL (4 to 8 vCPU, 32 GB, with a read replica),
   managed Redis, and an S3 bucket.
2. Set `DATABASE_URL` to PostgreSQL, `REDIS_URL` to the Redis endpoint, and
   `INSTANCE_COUNT` to the number of app instances.
3. Run 3 to 6 app instances (8 vCPU, 16 GB) behind the load balancer with
   `/ready` health checks and a 120 s or longer idle timeout.
4. Run `prisma migrate deploy` once per release before rolling out instances,
   one instance at a time.

## 6. Tier 3: 100 million users

Follow the architecture in section 2. Rollout order that limits risk:

1. Finish every item in section 3 and pass a load test at 1.5x the peak figures
   in section 1.
2. Deploy to three regions or zones, with shards pinned to their primary zone
   and replicas in the other two.
3. Enable autoscaling on connected sockets (target 25,000 per pod) and on CPU.
4. Put the web app and uploads behind a CDN, and rate-limit signup and the
   Apple/Google recovery endpoints at the edge as well as in the app.
5. Practice failover: kill a shard primary, a Redis node and an app pod during
   load, and confirm clients reconnect with the stored device key.
6. Open signups gradually (for example 5% of traffic per day) while watching
   p99 latency, socket reconnect rate, database replication lag and push
   delivery.

## 7. Operations checklist

- Alert on `/ready` failures, p99 API latency, WebSocket disconnect rate,
  database replication lag, Redis memory, and push failure rate.
- Rotate `JWT_SECRET` only with a planned forced sign-in; never rotate
  `USER_DATA_ENCRYPTION_KEY` without a migration.
- Reset (`npm run reset --prefix server`) deletes all data. Never run it on
  production.
