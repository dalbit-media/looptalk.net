# LoopTalk Launch Runbook

This is the release source of truth. Repository-controlled launch gates are automated; the unchecked items require account ownership, credentials, DNS, or physical devices.

**Current status (English):** Server checks, release smoke, and web export pass.
Expo Doctor currently reports SDK package-version mismatches, so the mobile
dependency gate remains open. EAS project `@eddiec2025/looptalk` is linked and
Android signing is configured. Production hosting, EAS variables, iOS signing,
signed builds, device certification, and store submission remain.

**현재 상태 (한국어):** 서버 검사, 릴리스 스모크 테스트, 웹 내보내기는 통과합니다.
Expo Doctor에서 SDK 패키지 버전 불일치가 확인되어 모바일 의존성 검사는 미완료입니다. EAS
프로젝트 `@eddiec2025/looptalk` 연결과 Android 서명이 완료되었습니다. 운영 서버,
EAS 환경 변수, iOS 서명, 서명 빌드, 실제 기기 검증 및 스토어 제출이 남았습니다.

**現在の状況 (日本語):** サーバー検査、リリーススモークテスト、Webエクスポートは成功しています。
Expo DoctorがSDKパッケージのバージョン不一致を報告しているため、モバイル依存関係の検査は未完了です。
EASプロジェクト`@eddiec2025/looptalk`のリンクとAndroid署名は完了しています。
本番ホスティング、EAS環境変数、iOS署名、署名済みビルド、実機検証、ストア提出が残っています。

## 0. Verified Repository State

- [x] Server checks pass `10/10`; the Prisma schema validates
- [ ] Expo Doctor passes `20/20`; SDK dependency-version check is currently failing
- [x] Production web export succeeds
- [x] Release smoke covers reporting, duplicate rejection, account deletion, token rejection, and ownership transfer
- [x] Server and client production dependency audits report zero vulnerabilities
- [x] EAS project `@eddiec2025/looptalk` is linked
- [x] Android production keystore is generated and stored in EAS
- [x] Release workflow runs on both `main` and `master`
- [ ] Add a Git remote, push the release candidate, and confirm both Release gate jobs pass

## 1. External Accounts and DNS

- [ ] Apple Developer and App Store Connect access for `com.looptalk.app`
- [ ] Google Play Console access for `com.looptalk.app`
- [x] Expo/EAS project linked as `@eddiec2025/looptalk`
- [ ] Replace the current parked `looptalk.app` DNS target and route HTTPS traffic to the LoopTalk container
- [ ] `support@looptalk.app`, `privacy@looptalk.app`, and `legal@looptalk.app` receive mail
- [ ] Persistent `/data` volume for the SQLite database and uploads, with tested backups and restore
- [ ] Coturn deployment with UDP, TCP, and TLS listeners
- [ ] Sentry organization/projects for server and client

## 2. Server Secrets

Start from `server/.env.example`. Set every production gate:

- `DATABASE_URL`, `JWT_SECRET`, `PUBLIC_URL`, `CORS_ORIGIN`
- `TURN_URLS`, `TURN_SECRET`
- `ADMIN_USER_IDS`, `SENTRY_DSN`, `RELEASE_VERSION`
- `APPLE_TEAM_ID`, `ANDROID_CERT_SHA256`
- `EXPO_ACCESS_TOKEN`
- `UPLOAD_DIR=/data/uploads`

Social sign-in is disabled (HTTP 426); do not provision server Google/Apple
token-verification dependencies or client IDs for this release.

Deploy the root `Dockerfile` as a single server instance. It builds the Next.js
website and browser client, generates the SQLite Prisma client, synchronizes
the schema at startup, serves `/ready`, and persists the database and uploads
under `/data`. Back up both the database and uploaded files. Multi-instance
deployment is not supported by the current SQLite configuration; Redis does
not provide a shared database. Expo is used only for separately signed Android
and iOS builds. For Hostinger's `Other` framework mode, use `.next` as the
output directory and `server/scripts/start.js` as the entry file.

Startup synchronizes only safe schema changes; it no longer accepts data loss
automatically. Stop and review Prisma errors instead of bypassing them.
For an intentional full reset, stop all instances and follow the
[destructive reset procedure](../server/README.md#destructive-reset).
Persist/back up the reset marker beside the database so updated reconnecting
clients can clear their app-owned storage; offline/older clients are not remotely
wiped.

Verify after deployment:

```bash
curl -f https://looptalk.app/health
curl -f https://looptalk.app/ready
curl -f https://looptalk.app/privacy
curl -f https://looptalk.app/terms
curl -f https://looptalk.app/support
curl -f https://looptalk.app/account-deletion
curl -f https://looptalk.app/.well-known/apple-app-site-association
curl -f https://looptalk.app/.well-known/assetlinks.json
SMOKE_API_URL=https://looptalk.app npm run smoke:release --prefix server
```

## 3. EAS Secrets and Builds

Do not set `EXPO_PUBLIC_API_URL` until the production `/health` and `/ready`
checks pass over HTTPS. The EAS `production` environment is currently empty.

Set these EAS environment values for `production`:

- `EXPO_PUBLIC_API_URL=https://looptalk.app`
- `EXPO_PUBLIC_SENTRY_DSN`
- Google OAuth client IDs
- `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` for source maps

Then run:

```bash
cd mobile
npx eas-cli@latest login
npx eas-cli@latest env:list production
npx eas-cli@latest credentials --platform ios
npx eas-cli@latest build --platform all --profile production
```

Android signing is already configured. `app.config.js` intentionally rejects a
production build when the HTTPS API, linked EAS project, or Sentry DSN is
missing. Do not submit either binary until Section 4 passes.

## 4. Physical Device Gate

Test the signed production build, not Expo Go, on at least one current and one older supported iPhone and Android device:

- [ ] Email/phone registration, invitation acceptance, Apple login, and Google login
- [ ] Account deletion followed by failed login/token reuse
- [ ] Direct/group text, image, video, voice, drawing, file, reply, edit, delete, reactions
- [ ] Offline send, reconnect retry, duplicate prevention, read state, and pagination
- [ ] Foreground/background/terminated message notifications and deep links
- [ ] Voice/video calls over Wi-Fi, cellular, NAT, TURN-only networks, interruption, and reconnect
- [ ] Camera missing/busy/denied on both caller and callee; incoming face/screen and microphone audio still work
- [ ] Voice -> camera -> screen -> camera/voice transitions, picker cancellation, browser Stop sharing, and hangup during pending permissions
- [ ] Screen text remains readable and uncropped; 15 fps sharing is acceptable for the intended content
- [ ] Microphone/camera unplug and reconnect; native wired/Bluetooth routing and speaker override
- [ ] Browser autoplay blocking exposes an actionable audio retry; keyboard controls and minimized-call audio work
- [ ] Short ICE disconnect and failed ICE restart, expired TURN credentials, new Socket.IO ID resumption, and explicit recovery timeout
- [ ] Real TURN relay selection verified with UDP blocked and TLS/TCP-only networks; use a valid certificate and a reachable TLS port (commonly 443)
- [ ] Cross-browser Chrome/Edge, Firefox, Safari; desktop sharing plus rebuilt Android media-projection consent and stop actions
- [ ] Packet loss/jitter/bandwidth shaping and 30+ minute calls; record connection success, time to first audio/video, recovery time, audio concealment, video freezes, battery and relay usage
- [ ] Incoming-call behavior while backgrounded and terminated
- [ ] Camera, microphone, photo, notification, and Bluetooth permission denial/recovery
- [ ] User and message reports; block behavior; moderator queue review
- [ ] Universal invitation links from Mail, Messages, Safari, and Chrome
- [ ] Upgrade from the previous build without losing cached conversation state
- [ ] Sentry test events from server, iOS, and Android

Incoming calls from a terminated iOS process must be proven on the signed build. If ordinary remote notification delivery is not reliable enough, implement PushKit VoIP pushes before release; do not claim guaranteed terminated-state ringing without that evidence.

Calling is still one-to-one peer-to-peer WebRTC, not an SFU conferencing
service. Production requires deployed TURN with short-lived credentials,
regional capacity, monitoring, and tested UDP/TCP/TLS connectivity. STUN-only
fallback cannot guarantee connectivity on restrictive networks. Native iOS
screen capture still requires a signed ReplayKit broadcast extension/app group.
Browser tests with synthetic media are regression evidence, not substitutes
for real screen-picker, physical-device, relay-only, load, or long-call testing.

## 5. Store Submission

Use `docs/STORE_LISTING.md` and `docs/PRIVACY_DISCLOSURES.md` for listing text and forms. Upload real-device screenshots, provide an invitation-enabled review account, and explain invitation access in review notes. Complete Android foreground-service/phone permission declarations for calling.

After all earlier sections pass:

```bash
cd mobile
npx eas-cli@latest submit --platform ios --profile production
npx eas-cli@latest submit --platform android --profile production
```

Release only when CI `Release gate` is green, both store binaries pass the physical-device gate, backups have been restored successfully, and an on-call moderator is assigned.
