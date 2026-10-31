# LoopTalk Server

## Poll forum

Any authenticated user can browse and create forum polls with a question
(1–300 characters) and 2–10 distinct options (1–120 characters each).
Each account gets one final vote per poll. A database uniqueness constraint
prevents duplicate/concurrent votes, and a composite foreign key prevents votes
for another poll's option.

All routes below require authentication:

Invited authors' posts have 1–5 normalized topic tags (1–24 letters, numbers or hyphens each).
The shared local keyword rules suggest topics in English, Korean and Japanese;
authors can edit suggestions. Empty tag arrays fall back to `general`, and older
posts get `general` through the additive `20261031010000_forum_tags` migration.
For authors whose current account is not a member, the server returns only
`not-invited`, including existing posts. Guests cannot supply topic tags (403);
new guest posts store an empty topic array. Joining removes `not-invited`, with
`general` as the fallback when no topic tags exist.
Guests' feeds contain only public `not-invited` posts and have no scope tabs.
Direct post links enforce the same guest boundary: public posts by invited
authors and non-public posts return 404 to guests.
Members hide these posts by default; `includeGuests=true` includes them within
the selected scope, with filtering applied before pagination.

- `GET /api/forum/polls?page=1`: newest polls and the caller's participation;
  never includes vote totals, other people's votes, or comments.
  Also returns `tagTrends: [{ authorId, tag, count }]`, counting posts per tag
  over the last seven days before pagination, for Public only. Members receive
  public trends including `not-invited` counts even when the default post list
  excludes guests; guests receive guest-only trends. Other scopes return an
  empty trends array. Private contact lists are never sent to the server.
- `POST /api/forum/polls`: `{ question, options: ["...", "..."], tags?: ["topic"] }`.
- `GET /api/forum/polls/:id`: question and options; includes `results` and
  `totalVotes` only if the caller has voted in this poll, including its creator.
- `POST /api/forum/polls/:id/reactions`: `{ emoji }`; members can toggle one of
  the supported emoji reactions independently of voting. Poll responses include
  per-emoji counts and whether the caller reacted, never other user identities.
- `POST /api/forum/polls/:id/vote`: `{ optionId }`; duplicate votes return 409.
- `GET /api/forum/polls/:id/comments?page=1`: newest comments.
- `POST /api/forum/polls/:id/comments`: `{ content }` (1–2,000 characters),
  Invited members must vote to use either comments route (otherwise 403).
  Guests may read and post comments without voting only on public posts by
  non-invited authors; other posts return 404, matching direct-detail access.

Lists use 20-item pages and return `hasMore`. Forum writes are limited to 30 per
minute per account, in addition to the existing API limiter. Responses are
`no-store`. Public author names are used; private profiles are not exposed.
Questions, options, votes and comments persist as server-readable data, not
end-to-end encrypted chat. Voting access is an API restriction, not a guarantee
against a participant sharing results elsewhere. Account deletion cascades to
that user's polls (and their votes/reactions/comments), votes, reactions and comments.

Apply migrations `20261018070000_poll_forum` and
`20261031000000_forum_reactions` or use the existing additive
schema-push workflow. Normal startup regenerates the Prisma client and then
synchronizes the schema without resetting data. Restart the server after schema
changes; an already-running process retains its previously loaded Prisma client.
On Windows, stop the old server before restarting if generation reports a locked
Prisma engine.

## Development startup

`npm run dev` regenerates the Prisma client and synchronizes the SQLite schema
before accepting requests. A generation or schema update failure stops startup.
It logs schema setup progress and elapsed server readiness time.

The API and Socket.IO start without waiting for development page compilation.
When `mobile/dist/index.html` exists (created by root `npm run export:web`),
the exported `/app/` messenger is also immediately available.
The Next.js website initializes once, on its first request; concurrent
website requests wait for that same preparation. Website failures are reported
through normal HTTP error handling rather than silently ignored. If no exported
messenger exists, the `/app/` fallback initializes and compiles through Next.js
on its first request. A cold first website/source-client request can still be
slower than API startup. Production always prepares Next.js before listening.

Sentry and the Redis adapter are loaded only when `SENTRY_DSN` and `REDIS_URL`
respectively are configured. A configured Redis adapter must still connect
before the server accepts sockets.

## Web app installation telemetry

The web messenger offers installation from the top-right Messages header,
not Settings. Native apps and detected installed web apps hide the action.
Confirmed `appinstalled` events, standalone launches, or detection of this
installed web app report an anonymous browser installation ID to
`POST /api/telemetry/web-app-install` with authentication and a JSON
`{ installationId }` body. IDs must contain 16–100 letters, digits, underscores
or hyphens. Reports are idempotent, persist in `WebAppInstallation`, and retain
only the installation ID and server timestamp, not user identities.

The admin dashboard shows `counts.webAppInstalls` from the service overview.
This is an observed install count, not a count of clicks, accepted prompts,
binary downloads, or all installs worldwide. Manual installs are counted when
the user opens the standalone app and signs in. Retries do not increase the
count. Historical counts survive account deletion.

Run `npm run db:setup` after upgrading to create the telemetry table.

## Signup welcome and feedback

Invited registration atomically creates a normal two-member `CHAT` with the
surviving inviter and one fixed `TEXT` attributed to that inviter with
`automaticWelcome: true`. This clearly labeled onboarding notice is the only
server-readable automatic message; ordinary replies still require E2EE.
No plaintext Contact row is created. The authenticated
`GET /api/auth/invitation-onboarding` endpoint lets registration/login/startup
import the inviter first into the invitee's encrypted owner vault. A durable
encrypted completion marker prevents duplicates and respects later removal.
Anonymous/bootstrap invitations and deleted inviters produce no synthetic sender.
Invitation creation first registers the inviter's encryption device so the
invitee can reply even while the inviter is offline. An older inviter without
any registered device must open an updated client before encrypted delivery.
Apply `20261017070000_invitation_welcome` (or the existing additive `db:push`
workflow) and regenerate Prisma before starting the upgraded server.
Operational invitation issuer/redemption IDs are retained.
Social and plaintext-password registration are disabled.
Existing legacy welcome/support history remains readable; new private accounts
cannot use WELCOME to bypass the encrypted-message write requirement.

### Invitation identity and appearance

New invitation codes contain 10 uppercase letters/digits (for example
`7AC4M9K2XE`), excluding `0`, `1`, `I`, and `O` to reduce transcription errors.
Codes may be typed or printed as `7AC4M-9K2XE`: entry and server lookups ignore
spaces/hyphens and letter case. Generation uses cryptographic randomness,
checks both invitation tables for collisions, and retries up to five times.
Existing 8-character and 32-character invitation links remain valid.
Invitations still expire after seven days and can be redeemed only once.

Updated clients explicitly send their current decrypted display name as
`inviterDisplayName` when creating an invitation. The creation screen discloses
that this snapshot is server-readable and visible to anyone holding the link.
Only that name is shared, not the encrypted vault, email, phone, photo or bio.
Names are validated (1–100 characters, no control characters) and escaped in HTML.
`GET /api/invitations/:code` exposes only `{displayName, username}` as `inviter`;
the landing page and client show `Display name (username)`. The username is the
current public username, while the shared display name stays as it was at
creation. Older links without a snapshot use the public username; deleted
inviters use the generic LoopTalk label. Existing private profiles are never
decrypted or published by the server.
Account deletion clears the owner's shared invitation-name snapshots while
retaining the existing operational invitation metadata.

Apply the additive `PrivateInvitation.inviterDisplayName` schema update and
regenerate Prisma before deployment. No reset or historical-name backfill is
required. The landing page loads the site's shared `public/site/theme.css`
palette and synchronous `theme.js`, honoring saved light/dark/system settings,
live changes and system dark mode without JavaScript. Invitation HTML is
non-cacheable and does not send referral URLs as referrers.

## Credential accounts (phase 1)

Provision `USER_DATA_ENCRYPTION_KEY` as a persistent, secret, canonical base64 encoding
of 32 random bytes before starting **any** environment. `.env.example` deliberately
contains no usable key. Do not replace a deployed key without migrating ciphertext
and keyed indexes; losing it prevents credential lookup. Startup fails closed if absent.
For a local checkout run `npm run privacy:key --prefix server` from the repository
root. This appends a secure key only if the entry is absent, never overwrites or
prints it, and rejects invalid existing values (including the empty example
placeholder; remove that placeholder line before setup). Existing valid process
environment configuration is honored without writing it to disk. `.env` is
gitignored; file permissions are 0600 on supporting systems. Then run
`npm run prisma:generate --prefix server` and `npm run db:push --prefix server`.

Clients normalize email by trimming and lowercasing; phones strip whitespace,
parentheses, dots and hyphens and must match `^\+?\d{7,15}$`.
Passwords stay exact, are never sent, and must be 8–128 characters on the client.
Clients derive their root with PBKDF2-HMAC-SHA256, 600000 iterations, using their
normalized identifier, exact password, and random 16-byte per-account salt.
The root supplies the existing Ed25519 signing key and owner-encrypted vault.
The server cannot validate password length/strength or verify client KDF compliance.

`POST /api/auth/credential-parameters {identifier}` returns
`{salt,iterations:600000,version:1}`. Unknown identifiers receive deterministic,
secret-HMAC synthetic salts of identical shape. This reduces, but does not eliminate,
enumeration (registration conflicts and timing remain observable).
`POST /api/auth/register {identifier,credentialSalt,publicKey,vault,invitationCode}`
creates a random `user.id` (`u_` plus 32 hex digits), separately storing the
canonical key-derived `authAccountId`. Responses include canonical `accountId`;
use this for challenge/login and vault associated data, and `user.id` for routing.
`/auth/challenge` and `/auth/login` retain the existing signed challenge protocol.
Identifier contacts are AES-256-GCM ciphertext (fresh 12-byte nonce, versioned AAD)
with a domain-separated HMAC-SHA256 unique lookup index. The public salt is not secret.
The server key protects contacts, not the vault. Database plus server-key compromise
exposes contacts; public salts/verifiers permit offline password guesses.
Use TLS, strong passwords, protected backups, and secret-manager provisioning.

`PUT /api/users {username?,displayName?,vault?,expectedRevision?}` supports explicit public
username reservation (3–24 ASCII letters/digits/underscore, lowercase, unique)
and the encrypted-vault compare-and-set adapter. Username conflicts return 409.
IDs cannot change. Exact ID or case-insensitive exact reserved-username search
accepts an optional leading `@` and never searches private profiles or identifier contacts. Peers see public usernames
and public display names, falling back to opaque IDs.
Display names are public (1–100 trimmed characters, no control characters).
New clients publish names at registration and profile edit. Existing accounts
publish the saved vault name when the updated client opens their session.
The nullable `User.publicDisplayName` column is separate from legacy private
profile fields: the additive migration never publishes old plaintext records.
Startup applies the schema automatically; run `npm run prisma:generate` after
updating the schema and restart the server.
New registrations receive a unique random 12-character lowercase hexadecimal
public username (for example `7ac40d92e681`), without the `u_` prefix. It is
searchable and can be changed using the same username endpoint. Collisions are
checked against existing usernames before creation; database uniqueness remains
the final guard. Internal routing/authentication IDs retain their existing
format. Existing accounts and chosen usernames are not renamed.
Conversation list/detail/direct responses include each `participants[].user` as
`{id,username,displayName}` with the published display name, reserved public username or opaque ID fallback;
private profile fields and credential verifiers are never selected for that projection.
There is no OTP, reset, recovery phrase, or credential-change endpoint.
Existing manual-key accounts still authenticate;
legacy migration can bind `identifier` + `credentialSalt` to the new public key only
with the owner's legacy-authorized migration token. It cannot rebind migrated accounts.

Apply additive schema updates using `npm run db:push` (no reset or data-loss flags);
the credential migration adds only nullable fields and unique indexes. Existing
plaintext legacy rows remain until owner-authorized migration; historical shared
records are not retroactively encrypted. Authentication rate limits/challenges
are process-local; multi-instance deployment needs shared rate limiting.
REST and Socket.IO polling/WebSocket share a request-aware CORS policy: same-origin
works without `CORS_ORIGIN`; reverse-proxy deployments may set their external
`PUBLIC_URL` origin explicitly. Other production browser origins require the
`CORS_ORIGIN` allowlist. Missing Origin is accepted for native clients; Origin is
not authentication, and Socket.IO still requires a signed session token.

The public invitation map always shows actual non-system users and recorded
invitation topology, including empty and small networks. New private
invitations retain nullable operational issuer/redeemer IDs and acceptance times;
owner labels/history stay in the encrypted vault and no contact rows are created.
Legacy migration clears invitation email addresses but preserves these operational
edges. Each public snapshot remaps at most 2000 current account IDs to shuffled
integers and exposes `{id,parentId,label}`, aggregate counts, and snapshot metadata.
The label is the final four characters of the user ID (not necessarily unique);
full account IDs, usernames, invite codes, timestamps and private profiles remain
hidden. Small labels are collision-filtered; zoom in to reveal crowded nodes.
Topology itself remains observable metadata, not an unlinkability guarantee.
Historical private links that were never stored cannot be reconstructed.

The map polls `/api/invitations/map/traffic` every two seconds for actual encrypted
relay payload activity. Green outgoing pulses represent newly accepted uploads;
amber incoming pulses represent completed payload responses to devices. Zoomed
labels estimate payload bytes, not plaintext size or full network bandwidth.
Invitation edges remain referral relationships, not message routes. Calls,
headers, rejected requests and duplicate dispatches are not counted. No message,
conversation, device or full user IDs are published by the traffic endpoint.
Samples are held only in the current worker's bounded memory (10 seconds / 2000
events), with up to 128 recent node pulses drawn at once.
The traffic overlay is capped at 30 FPS and backs off further after expensive
frames. It pauses offscreen/in hidden tabs, coalesces redraw requests, stops
when idle, and caps pixel density at 2x. Hidden tabs also pause traffic polling.
Labels are hidden during pan/zoom; trees of 1000+ nodes also hide edges until
the camera settles. The map itself remains capped at 2000 nodes.
Multi-worker deployments
show activity observed by the polled worker, not a cluster-wide total. Traffic
requests require the matching map snapshot to prevent attaching activity to the
wrong shuffled node IDs. Connection failures are shown explicitly and retried.

Legacy operator support threads remain a historical compatibility feature only.
Administrators listed in `ADMIN_USER_IDS` can track operator WELCOME replies on `/admin`; the public
statistics page never shows them. Replies refresh every minute and older
replies can be loaded. Edited replies show their current content, deleted
replies show a placeholder, and account deletion removes the thread and its
replies.

`GET /api/admin/welcome-replies` requires an authenticated administrator. It
returns `{ replies, nextCursor }`, newest first. Optional `limit` is an integer
from 1 to 100 (default 50); pass `nextCursor` as `before` for the next page.
Each reply includes its sender's opaque ID/handle, conversation ID,
content/media metadata, and creation/edit/deletion timestamps. Ordinary chats
and messages sent by LoopTalk are excluded.

After updating, run `npm run db:setup` to generate the Prisma client and apply
the schema. Stop the development server first if Windows reports
a locked Prisma engine during generation.

[한국어](#한국어) | [日本語](#日本語) | [English](#english)

## 한국어

서버는 인증, 초대 기반 접근, 연락처 및 대화 메타데이터, 프로필 미디어와
실시간 Socket.io 중계를 제공합니다. 새 개인·그룹 메시지와 반응은 암호문으로 중계하고,
모든 수신 기기의 저장 확인 후 삭제합니다. 운영자 대화는 서버에 보관합니다.
[암호화 메시징 API·배포·보안 한계](../docs/ENCRYPTED_MESSAGING.md)를 확인하세요.

### 로컬 설정

먼저 `.env.example`을 운영체제에 맞는 복사 도구로 `.env`에 복사하세요.

```sh
npm ci
npm run db:setup
npm run dev
```

로컬 개발과 운영 환경 모두 SQLite를 사용합니다. 운영 환경에는 데이터베이스와
업로드를 보존할 영구 볼륨이 필요하며, 현재는 단일 서버 인스턴스만 지원합니다.
빈 데이터베이스의 첫
계정은 초대 없이 등록할 수 있으며 이후에는 사용 가능하고 만료되지 않은
초대가 필요합니다.

`npm run dev`는 Next.js 사용자 인터페이스와 커스텀 Node 서버에서 API,
Socket.io 및 `/app/` 웹 클라이언트를 제공합니다. 브라우저 클라이언트는
`mobile/` Expo 앱에서 내보냅니다.

### 명령어

| 명령어 | 용도 |
| --- | --- |
| `npm run dev` | 통합 개발 서버 시작(자동 재시작: `npm run dev -- --watch`) |
| `npm start` | 감시 모드 없이 시작 |
| `npm test` | Node 테스트 실행 |
| `npm run check` | 소스 구문, 테스트 및 SQLite 스키마 검증 |
| `npm run db:setup` | Prisma 클라이언트 생성 및 SQLite 스키마 반영 |
| `npm run db:reset -- --confirm-reset` | DB 스키마와 데이터만 초기화 후 시스템 계정 시드 |
| `npm run reset` | DB, 업로드, 재접속 클라이언트 데이터 전체 초기화 |
| `npm run db:seed` | 로그인할 수 없는 시스템 계정만 생성(반복 실행 가능) |
| `npm run db:studio` | 구성된 SQLite 데이터베이스용 Prisma Studio 열기 |
| `npm run prisma:generate` | SQLite Prisma 클라이언트 생성 |
| `npm run db:push` | 데이터 손실 자동 승인 없이 스키마 반영 |

### 환경 변수

시작 시 필수:

- `DATABASE_URL`: SQLite 파일 URL. 기본값은 `file:./looptalk.db`
- `JWT_SECRET`: 32자 이상의 강력한 JWT 서명 비밀 값

선택적 서비스 설정:

- `CORS_ORIGIN`: 쉼표로 구분한 허용 웹 출처
- `PUBLIC_URL`: 초대 링크에 사용하는 외부 접근 가능 주소
- `TURN_URLS`, `TURN_SECRET`: 통화 릴레이 설정
- `ADMIN_USER_IDS`, `SENTRY_DSN`: 운영 및 모니터링 소유권
- `APPLE_TEAM_ID`, `ANDROID_CERT_SHA256`: 앱 링크 서명 식별자

소셜 로그인은 비활성화되어 있습니다(HTTP 426). 서버용 Google/Apple 토큰 검증
라이브러리와 클라이언트 ID 설정은 필요하지 않습니다.

모든 실행에 `.env.example`을 사용하세요. 예제 값은 실행 전에 실제 비밀 값과
서비스 주소로 교체해야 합니다.

### 데이터 소유권

Prisma에는 계정·대화·전달 정보, 임시 암호문과 운영자 대화가 저장됩니다.
새 개인·그룹 메시지는 수신 기기의 로컬 저장 확인 후 서버에서 삭제되며, 새 기기로
이미 전달된 기록을 복원하지 않습니다. 소켓 알림에는 메시지 내용을 넣지 않습니다.

모든 경로는 `src/db/client.js`의 단일 클라이언트를 가져옵니다. 다른 위치에서
Prisma 클라이언트를 생성하면 `npm run check`가 실패합니다.

### HTTP API

최초 등록 상태, 가입, 로그인, 소셜 인증, 초대 열기/미리보기 및 상태 확인을
제외한 모든 엔드포인트에는 `Authorization: Bearer <token>`이 필요합니다.

#### 인증

| 메서드 | 경로 | 용도 |
| --- | --- | --- |
| `GET` | `/api/auth/bootstrap-status` | 첫 계정 생성 가능 여부 조회 |
| `POST` | `/api/auth/register` | 최초 등록 또는 초대 규칙으로 가입 |
| `POST` | `/api/auth/challenge` | Ed25519 로그인 챌린지 발급 |
| `POST` | `/api/auth/login` | 계정 ID와 Ed25519 서명으로 로그인 |
| `POST` | `/api/auth/social` | 비활성화됨 (HTTP 426) |
| `GET` | `/api/auth/me` | 인증된 사용자 반환 |
| `POST` | `/api/auth/device-token` | 푸시 토큰 등록 |
| `DELETE` | `/api/auth/device-token` | 사용자의 푸시 토큰 비활성화 |

#### 메시지 및 대화

| 메서드 | 경로 | 용도 |
| --- | --- | --- |
| `GET` | `/api/conversations` | 참여 정보와 대화 메타데이터 목록 조회 |
| `POST` | `/api/conversations/direct/:userId` | 일대일 대화 조회 또는 생성 |
| `POST` | `/api/conversations` | 그룹 대화 생성 |
| `GET` | `/api/conversations/:id` | 대화 메타데이터 조회 |
| `POST` | `/api/conversations/:id/leave` | 대화 나가기 |
| `GET` | `/api/messages/:conversationId` | 페이지가 지정된 메시지 기록 조회 |
| `POST` | `/api/messages/:conversationId/text` | 텍스트 저장 및 중계 |
| `POST` | `/api/messages/:conversationId/media` | 미디어 저장 및 중계 |
| `POST` | `/api/messages/:conversationId/:messageId/react` | 반응 중계 |
| `PUT` | `/api/messages/:conversationId/:messageId` | 수정 중계 |
| `DELETE` | `/api/messages/:conversationId/:messageId` | 삭제 중계 |

연락처, 사용자, 초대, 프로필 미디어 및 링크 미리보기는 각각
`/api/contacts`, `/api/users`, `/api/invitations`, `/api/media`,
`/api/link-preview` 아래에 구현되어 있습니다. 요청 필드의 세부 사항은 각
경로 모듈을 확인하세요.

### Socket.io

클라이언트는 `auth.token`으로 인증합니다. 지원하는 클라이언트 이벤트는
`join_conversation`, `leave_conversation`, `typing`, `stop_typing`,
`message_read`, `user_status`입니다. 서버 이벤트는 `new_message`,
`message_reacted`, `message_edited`, `message_deleted`, `user_typing`,
`user_stop_typing`, `message_read`, `user_status_changed`, `user_offline`입니다.

### 운영 환경

현재 `looptalk.app`은 운영 서버를 제공하지 않으므로 네이티브 운영 빌드를 만들기
전에 다음 순서로 배포해야 합니다.

1. SQLite 데이터베이스와 `/data/uploads`를 보존하는 `/data` 영구 볼륨 및 백업을 준비합니다.
2. SQLite `DATABASE_URL`, 강력한 `JWT_SECRET`, `PUBLIC_URL`, `CORS_ORIGIN`,
    관리자, Sentry, 앱 링크 서명 및 공급자 설정을 구성합니다.
3. 통화 릴레이용 Coturn을 배포합니다. SQLite 사용 중에는 서버를 단일 인스턴스로 운영합니다.
4. 루트 `Dockerfile`을 HTTPS 역방향 프록시 뒤에 배포합니다. 컨테이너 시작 시
    Prisma가 현재 스키마를 SQLite 데이터베이스에 반영합니다.
5. `/health`, `/ready`, 법률 페이지, 앱 링크 파일 및
    `npm run smoke:release`를 운영 주소에서 검증합니다.
6. 백업 복원을 시험하고 Sentry 서버 이벤트와 운영자 신고 대기열 접근을 확인합니다.

---

## 日本語

サーバーは認証、招待制アクセス、連絡先と会話のメタデータ、プロフィール
メディア、リアルタイムSocket.io中継を提供します。新しい個人・グループ配信は暗号文を中継し、
全対象端末の保存確認後に削除します。以前の履歴と運営者の会話は残ります。
[暗号化APIと制限](../docs/ENCRYPTED_MESSAGING.md)を確認してください。

### ローカルセットアップ

`.env.example`をOSに合った方法で`.env`へコピーしてから実行します。

```sh
npm ci
npm run db:setup
npm run dev
```

ローカル開発と本番環境の両方でSQLiteを使用します。本番ではデータベースと
アップロードを保持する永続ボリュームが必要で、現在はサーバー1インスタンスのみ対応しています。
空のデータベースでは
最初のアカウントを招待なしで登録でき、それ以降は未使用かつ有効期限内の
招待が必要です。

`npm run dev`はNext.jsユーザーインターフェースとカスタムNodeサーバーから
API、Socket.io、`/app/` Webクライアントを提供します。ブラウザクライアントは
`mobile/`のExpoアプリからエクスポートされます。

### コマンド

| コマンド | 用途 |
| --- | --- |
| `npm run dev` | 統合開発サーバーを起動（自動再起動: `npm run dev -- --watch`） |
| `npm start` | 監視モードなしで起動 |
| `npm test` | Nodeテストを実行 |
| `npm run check` | ソース構文、テスト、SQLiteスキーマを検証 |
| `npm run db:setup` | Prismaクライアントを生成しSQLiteスキーマを反映 |
| `npm run db:reset -- --confirm-reset` | DBのスキーマ・データのみ初期化しシステムアカウントを作成 |
| `npm run reset` | DB・アップロード・再接続クライアントデータを初期化 |
| `npm run db:seed` | ログイン不可のシステムアカウントのみ作成（冪等） |
| `npm run db:studio` | 設定済みSQLiteデータベース用のPrisma Studioを開く |
| `npm run prisma:generate` | SQLite Prismaクライアントを生成 |
| `npm run db:push` | データ損失を自動承認せずスキーマを反映 |

### 環境変数

起動時に必須:

- `DATABASE_URL`: SQLiteファイルURL。既定値は`file:./looptalk.db`
- `JWT_SECRET`: 32文字以上の強力なJWT署名シークレット

任意のサービス設定:

- `CORS_ORIGIN`: カンマ区切りの許可Webオリジン
- `PUBLIC_URL`: 招待リンクに使用する外部公開オリジン
- `TURN_URLS`, `TURN_SECRET`: 通話リレー設定
- `ADMIN_USER_IDS`, `SENTRY_DSN`: 運用および監視の所有者
- `APPLE_TEAM_ID`, `ANDROID_CERT_SHA256`: アプリリンク署名識別子

ソーシャルログインは無効です（HTTP 426）。サーバー用Google/Appleトークン検証
ライブラリとクライアントIDの設定は不要です。

すべての実行で`.env.example`を使用します。実行前に例示値を実際の
シークレットとサービスURLへ置き換えてください。

### データ所有権

Prismaにはアカウント・会話・配信情報、一時的な暗号文、以前の履歴・運営者の会話を保存します。
新しい配信は全対象端末の保存確認後に削除され、新端末に配信済み履歴は復元しません。

すべてのルートは`src/db/client.js`の単一クライアントをインポートします。
他の場所でPrismaクライアントを生成すると`npm run check`が失敗します。

### HTTP API

初回登録状態、登録、ログイン、ソーシャル認証、招待の表示/プレビュー、
ヘルスチェック以外は`Authorization: Bearer <token>`が必要です。

#### 認証

| メソッド | パス | 用途 |
| --- | --- | --- |
| `GET` | `/api/auth/bootstrap-status` | 最初のアカウント作成可否を取得 |
| `POST` | `/api/auth/register` | 初回登録または招待規則で登録 |
| `POST` | `/api/auth/challenge` | Ed25519認証チャレンジを取得 |
| `POST` | `/api/auth/login` | アカウントIDとEd25519署名で認証 |
| `POST` | `/api/auth/social` | 無効 (HTTP 426) |
| `GET` | `/api/auth/me` | 認証済みユーザーを返す |
| `POST` | `/api/auth/device-token` | プッシュトークンを登録 |
| `DELETE` | `/api/auth/device-token` | ユーザーのプッシュトークンを無効化 |

#### メッセージと会話

| メソッド | パス | 用途 |
| --- | --- | --- |
| `GET` | `/api/conversations` | 参加情報と会話メタデータの一覧を取得 |
| `POST` | `/api/conversations/direct/:userId` | ダイレクト会話を取得または作成 |
| `POST` | `/api/conversations` | グループ会話を作成 |
| `GET` | `/api/conversations/:id` | 会話メタデータを取得 |
| `POST` | `/api/conversations/:id/leave` | 会話から退出 |
| `GET` | `/api/messages/:conversationId` | ページ化されたメッセージ履歴を取得 |
| `POST` | `/api/messages/:conversationId/text` | テキストを保存して中継 |
| `POST` | `/api/messages/:conversationId/media` | メディアを保存して中継 |
| `POST` | `/api/messages/:conversationId/:messageId/react` | リアクションを中継 |
| `PUT` | `/api/messages/:conversationId/:messageId` | 編集を中継 |
| `DELETE` | `/api/messages/:conversationId/:messageId` | 削除を中継 |

連絡先、ユーザー、招待、プロフィールメディア、リンクプレビューは、
`/api/contacts`、`/api/users`、`/api/invitations`、`/api/media`、
`/api/link-preview`に実装されています。リクエスト項目の詳細は各ルート
モジュールを参照してください。

### Socket.io

クライアントは`auth.token`で認証します。対応するクライアントイベントは
`join_conversation`、`leave_conversation`、`typing`、`stop_typing`、
`message_read`、`user_status`です。サーバーイベントは`new_message`、
`message_reacted`、`message_edited`、`message_deleted`、`user_typing`、
`user_stop_typing`、`message_read`、`user_status_changed`、`user_offline`です。

### 本番環境

現在、`looptalk.app`は本番サーバーを提供していないため、ネイティブ本番ビルド
より先に次の順序で配備してください。

1. SQLiteデータベースと`/data/uploads`を保持する`/data`永続ボリュームおよびバックアップを準備します。
2. SQLite `DATABASE_URL`、強力な`JWT_SECRET`、`PUBLIC_URL`、`CORS_ORIGIN`、
    管理者、Sentry、アプリリンク署名、認証プロバイダー設定を構成します。
3. 通話リレー用Coturnを配備します。SQLite使用中はサーバーを1インスタンスで運用します。
4. ルート`Dockerfile`をHTTPSリバースプロキシの背後へ配備します。コンテナ起動時に
    Prismaが現在のSQLiteスキーマを反映します。
5. `/health`、`/ready`、法的ページ、アプリリンクファイル、
    `npm run smoke:release`を本番オリジンで検証します。
6. バックアップ復元、Sentryサーバーイベント、モデレーターの報告キューアクセスを確認します。

---

## English

The server provides authentication, invitation access, contact and conversation
metadata, encrypted private-message relaying, operator history, abuse reports, call signaling, push
notifications, and live Socket.io relays.

### Local Setup

Copy `.env.example` to `.env` using your operating system's file manager or
copy command before running these commands.

```sh
npm ci
npm run db:setup
npm run dev
```

Local development and production use SQLite. Production requires persistent
storage for the database and uploads;
the current configuration supports one server instance. The first registered account
bootstraps an empty database without an invitation. Later registrations require
a pending, unexpired invitation.

`npm run dev` serves the Next.js user interface, API, Socket.io, and the
`/app/` browser client from one custom Node server. Opt in to Node watch mode
with `npm run dev -- --watch`; it restarts the
custom server when server source changes; the browser client is exported from
the Expo app in `mobile/`.

### Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server; add `-- --watch` for server restarts |
| `npm start` | Start without watch mode |
| `npm test` | Run Node tests |
| `npm run check` | Parse source, test, and validate the SQLite schema |
| `npm run db:setup` | Generate the Prisma client and push the SQLite schema |
| `npm run db:reset -- --confirm-reset` | Recreate only the SQLite schema/data and seed the system account |
| `npm run reset` | Reset database, uploads, pending Redis calls, and updated clients on reconnect |
| `npm run db:seed` | Idempotently seed the non-login system account, without demo credentials |
| `npm run db:studio` | Open Prisma Studio for the configured SQLite database |
| `npm run prisma:generate` | Generate the SQLite Prisma client |
| `npm run db:push` | Synchronize schema without automatically accepting data loss |

### Destructive reset

Stop **all** server instances and back up the database and uploads first.
From the repository root:

```sh
npm run reset
```

The root and server npm scripts include `--confirm-reset`, so this command
immediately performs the destructive reset without extra arguments.
To print the resolved targets without changing anything, run
`node server/scripts/reset.js` from the repository root; direct invocation
still refuses to proceed without `--confirm-reset`.

The reset command uses `DATABASE_URL` and `UPLOAD_DIR` from the environment
or `server/.env`, recreates the schema from `prisma/schema.prisma`, removes every
upload, clears only LoopTalk pending-call keys in configured Redis, and seeds
only `looptalk-system` (`status: SYSTEM`). It creates no demo users, passwords,
or welcome chats; the first real account can still register without an invite.
This is an irreversible operator action, **not** a migration. Errors stop the
command and return a failure status; it is not transactional across database,
files and Redis. If a step fails, keep the server stopped, resolve the error,
and rerun the command before reopening the service.
With `NODE_ENV=production`, the command additionally requires
`--allow-production-reset`; confirmation alone cannot reset production.

Keep the generated `<database>.app-state.json` beside the database on its
persistent volume and include it in backups. After restarting, the public,
non-cacheable `GET /api/app-state` returns only the reset ID. Updated clients
check before auth initialization, on foreground/browser-online events, and
every 60 seconds while active. A new ID logs the user out and removes app-owned
local records, media/previews, preferences and known credentials, then records
the ID only after cleanup succeeds. Other origins and unrelated storage keys
are untouched; public offline app-shell assets are retained. A failed cleanup
blocks the app behind a visible retry screen.

This cannot erase offline clients until they reconnect, older binaries, exported
files, OS backups, or legacy native SecureStore keys with no remaining account
index (SecureStore cannot enumerate keys). Clear app data/reinstall manually
and remove retained OS keychain data where needed. Do not promise remote wiping.
`npm run db:reset --prefix server -- --confirm-reset` is explicitly
**database-only**: it seeds but retains uploads, Redis and the client reset ID.
Startup and `db:push` no longer auto-accept destructive schema changes.

### Environment

Required at startup:

- `JWT_SECRET`: strong JWT signing secret with at least 32 characters in
  production; local development uses a development-only default

Optional service settings:

- `DATABASE_URL`: SQLite file URL; defaults to `file:./looptalk.db`
- `CORS_ORIGIN`: comma-separated allowed web origins
- `PUBLIC_URL`: externally reachable origin used in invitation links
- `TURN_URLS`, `TURN_SECRET`: call relay configuration
- `ADMIN_USER_IDS`, `SENTRY_DSN`: operational and monitoring ownership
- `APPLE_TEAM_ID`, `ANDROID_CERT_SHA256`: app-link signing identifiers

Common optional settings:

- `WEB_CLIENT_URL`: web client frame URL, defaults to same-origin `/app/`

Social sign-in is disabled (HTTP 426). Server Google/Apple token-verification
libraries and client-ID settings are not required.

Copy `.env.example` to `.env` for server runs. `DATABASE_URL` may be omitted
for local development; replace the example secrets and service URLs before
starting the server.

### Data Ownership

Prisma stores account/conversation/delivery metadata, queued ciphertext, and
operator history. Private deliveries are removed after every addressed
device confirms local storage; new devices cannot restore flushed history.
Socket hints contain routing metadata, not message content or ciphertext.

All routes import the singleton client from `src/db/client.js`. Constructing a
Prisma client elsewhere fails `npm run check`.

### HTTP API

All endpoints except bootstrap, registration, challenge/login, legacy login, invitation
open/preview pages, and health require `Authorization: Bearer <token>`.

#### Authentication

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/auth/bootstrap-status` | Report first-account availability |
| `POST` | `/api/auth/register` | Register a public key and encrypted vault with bootstrap/invitation rules |
| `POST` | `/api/auth/challenge` | Obtain a single-use Ed25519 login challenge |
| `POST` | `/api/auth/login` | Authenticate by opaque account ID and Ed25519 signature |
| `POST` | `/api/auth/social` | Disabled (HTTP 426) |
| `GET` | `/api/auth/me` | Return the authenticated user |
| `POST` | `/api/auth/device-token` | Register a push token |
| `DELETE` | `/api/auth/device-token` | Disable the user's push tokens |
| `DELETE` | `/api/auth/account` | Permanently delete the authenticated account |

#### Messaging and Conversations

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/conversations` | List memberships and conversation metadata |
| `POST` | `/api/conversations/direct/:userId` | Get or create a direct conversation |
| `POST` | `/api/conversations` | Create a group conversation |
| `GET` | `/api/conversations/:id` | Read conversation metadata |
| `POST` | `/api/conversations/:id/leave` | Leave a conversation |
| `GET` | `/api/messages/:conversationId` | Read paginated message history |
| `POST` | `/api/messages/:conversationId/text` | Persist and relay text |
| `POST` | `/api/messages/:conversationId/media` | Persist and relay media |
| `POST` | `/api/messages/:conversationId/:messageId/react` | Relay a reaction |
| `PUT` | `/api/messages/:conversationId/:messageId` | Relay an edit |
| `DELETE` | `/api/messages/:conversationId/:messageId` | Relay a deletion |

The legacy plaintext message write endpoints above return 426 for private
accounts, including WELCOME conversations. Use `/api/secure` for private delivery.
Private profile/contact writes and profile uploads likewise return 426; use the encrypted
owner vault for private profile, contact, invitation-history and group-label data.
Public usernames and display names use `PUT /api/users`.

Contacts, users, invitations, profile media, and link previews are implemented
under `/api/contacts`, `/api/users`, `/api/invitations`, `/api/media`, and
`/api/link-preview`. Read the route modules for request field details.

Abuse reports are submitted with `POST /api/reports`. Users listed in
`ADMIN_USER_IDS` can page reports with `GET /api/reports` and update review
status with `PATCH /api/reports/:id`.

The `/admin` dashboard loads live counts and monthly invitation growth from
`GET /api/admin/overview`, which is restricted to authenticated users listed
in `ADMIN_USER_IDS`. Invitation acceptance timestamps and accepting accounts are
recorded during signup. Apply the schema and regenerate
the Prisma client with `npm run db:push --prefix server` followed by
`npm run prisma:generate --prefix server`. The dashboard estimates active message
payload bytes from text and declared attachment sizes, measures uploaded files
on the server disk, and does not report client-local storage. End-to-end
encryption protects private/group deliveries; user-managed cloud/disk backups
are not implemented.

### Socket.io

Clients authenticate with `auth.token`. Supported client events are
`join_conversation`, `leave_conversation`, `typing`, `stop_typing`,
`message_read`, and `user_status`. Server events include `new_message`,
`message_reacted`, `message_edited`, `message_deleted`, `user_typing`,
`user_stop_typing`, `message_read`, `user_status_changed`, and `user_offline`.

### Production

`looptalk.app` does not currently serve the production backend. Deploy it
before creating native production binaries, in this order:

1. Provision a persistent `/data` volume for the SQLite database and uploads,
    and test automated backups and restores.
2. Configure the SQLite `DATABASE_URL`, a strong `JWT_SECRET`, `PUBLIC_URL`,
    `CORS_ORIGIN`, moderation, Sentry, app-link signing, and identity-provider
    settings.
3. Deploy Coturn for call relay. Use one server instance while SQLite is
    configured.
4. Deploy the root `Dockerfile` behind an HTTPS reverse proxy. The current
   Prisma schema is synchronized to SQLite during startup.
5. Verify `/health`, `/ready`, legal pages, app-link files, and
    `npm run smoke:release` against the production origin.
6. Prove backup restoration, a Sentry server event, and moderator access to
    the report queue.

See [`docs/LAUNCH_RUNBOOK.md`](../docs/LAUNCH_RUNBOOK.md) for production secrets,
container deployment, native builds, device certification, and store submission.
# Owner-encrypted accounts

New accounts use Ed25519 proof-of-possession, not server-readable identity or
password registration. `POST /api/auth/register` accepts only
`{publicKey,vault,invitationCode?}`. The canonical padded-base64 public key is
32 bytes; the account ID is `u_` followed by the lowercase hex encoding of the
first 16 bytes of SHA-512 of that raw key. Opaque account IDs are the only public
profile handles. Legacy plaintext registration, social sign-in, profile/contact
writes, readable conversation names, and profile uploads return HTTP 426.

`POST /api/auth/challenge {accountId}` returns `{challengeId,challenge}`.
Sign the exact decoded challenge bytes with Ed25519 and submit
`POST /api/auth/login {accountId,challengeId,signature}`. Challenges are random,
single-use (including failed attempts), bound to account/action/Origin, expire
after two minutes, and live in a bounded process-local map. Authentication is
rate-limited. Multi-instance deployments must use sticky routing or replace the
challenge map and per-owner invitation throttle with shared atomic storage.
Restarting a process invalidates outstanding challenges.

Trusted-device sessions survive client reloads and restarts while local sign-in
data remains. Web stores the derived key/session in browser local storage;
native uses OS secure storage. Passwords are never saved. Startup signs a fresh
challenge instead of trusting an expired bearer token. Active clients renew
daily (checked hourly and on foreground/reconnect), retaining the existing
30-day token expiry. Transient startup failures show a retry screen without
erasing saved credentials. Logout, clearing local data, account deletion, and
application resets end saved sign-in. Shared browsers must be signed out.

Desktop invitation acceptance opens registration in the same centered 520x850
web-app popup as the website launcher (limited to the available screen size).
Mobile links retain native-app handoff and web fallback. Invited users land in
the inbox with an unread automatic welcome, not inside the conversation.
Peer profiles offer Add Contact for users not already in the owner's encrypted
contacts; adding a contact does not automatically open a chat.
Adding from a profile preserves its displayed name in the owner's encrypted
contact record while retaining the public username separately. Private names
that have not been shared remain unavailable through the public profile API.
Inbox titles, chat headers, sender/reply labels and typing indicators resolve
saved contact nicknames first, then current public display names, then saved names
and public usernames. Contact refresh fetches current public identities using
`POST /api/users/profiles {userIds}` in batches of at most 200 IDs, without sending
private nicknames or groups or modifying the encrypted vault.
Contact edits update these labels without reopening the chat; custom conversation
names still take precedence over contact names.

Registration/login return `{user,token,vault,revision}`. The vault is
`{version:1,nonce,ciphertext}`: canonical base64 24-byte nonce and 16–262144-byte
ciphertext. Encryption/decryption and key derivation are client-only; the server
can validate encoding and bounds but cannot verify ciphertext contents.
`GET /api/users/vault` reads only the authenticated owner's vault.
`PUT /api/users/vault {vault,expectedRevision}` atomically increments the revision;
a stale revision returns 409. Extra fields are rejected.

Private invitation capabilities are stored in `PrivateInvitation` with no issuer
or redeemer relation. New codes are 32 uppercase hex characters (legacy 8-character
codes remain redeemable). Creation returns
`{id:code,code,status:"CREATED",createdAt,expiresAt,invitationUrl,previewImageUrl,stats}`.
Public code lookup returns `{code,status:"PENDING"|"ACCEPTED"|"EXPIRED",expiresAt}`,
including spent tokens, with no inviter profile. Ownership/history belongs in the
encrypted vault; private server listing returns `[]` and private stats are zero
with an explanatory reason. The public invitation map shows actual users and
recorded invitation links with four-character user-ID suffixes. Redemption
atomically marks a capability spent and records its issuer,
accepted account, and acceptance time. Personal contact data remains encrypted;
the fixed inviter welcome is the explicit server-readable onboarding exception.

Legacy data is not silently deleted or migrated. `/api/auth/legacy-login` accepts
existing password credentials and issues a 15-minute migration-only token, usable
only for `/api/auth/legacy-data`, `/api/auth/migrate`, and explicit account deletion.
The owner-only export includes the old profile and contacts. Migration accepts
`{publicKey,vault,confirmation:"ENCRYPT_AND_REMOVE_LEGACY_PROFILE"}` after the client
has encrypted the export. It preserves the existing user ID but replaces the
username with the derived account ID, clears old profile/password/social columns,
and returns a normal session plus `accountId` and `legacyHistoryRetained:true`.
Historical contacts, messages, uploads, reports and invitation relationships are
retained, not retroactively encrypted. Passwordless legacy social accounts need a
separate verified recovery/migration procedure; new social sign-in is disabled.
Existing issued JWTs are not retroactively revoked by this migration.

Routing is not anonymous: membership, account/device public keys, push tokens,
capability state, IP/network activity and timing remain operational metadata.
Private accounts broadcast live foreground online/offline status to connected
authenticated clients, but do not persist or publish `lastActiveAt`.
Any active device keeps the account online; background-only connections are offline.
Peer profile responses omit activity/status fields. Typing labels are generated
from opaque authenticated IDs rather than client-supplied names.
An operator may correlate registration/redemption timing or observe a token during
issuance even though no persistent private invitation issuer/redeemer edge exists.
Reports from private accounts require `discloseToOperator:true` and disclose
category plus pseudonymous routing IDs/timestamps; free-text details are refused,
and readable profile/message snapshots are not automatically copied.

The additive migration `20261016090000_private_accounts` adds nullable key/vault
columns, a revision column, and the issuer-free capability table. Apply it through
the deployment's normal migration procedure. Tests create separate SQLite databases
under `server/test` and never reset or modify the development database.
