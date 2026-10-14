# LoopTalk Server

[한국어](#한국어) | [日本語](#日本語) | [English](#english)

## 한국어

서버는 인증, 초대 기반 접근, 연락처 및 대화 메타데이터, 프로필 미디어와
실시간 Socket.io 중계를 제공하며 메시지와 반응을 영구 저장합니다.

### 로컬 설정

```powershell
npm install
Copy-Item .env.example .env
npm run db:setup
npm run dev
```

로컬 개발과 운영 환경 모두 MySQL을 사용합니다. 빈 데이터베이스의 첫
계정은 초대 없이 등록할 수 있으며 이후에는 사용 가능하고 만료되지 않은
초대가 필요합니다.

`npm run dev`는 Next.js 사용자 인터페이스와 커스텀 Node 서버에서 API,
Socket.io 및 `/app/` 웹 클라이언트를 제공합니다. Next.js가 루트 `web/`
클라이언트 소스를 직접 컴파일합니다.

### 명령어

| 명령어 | 용도 |
| --- | --- |
| `npm run dev` | 통합 웹/API 서버 및 클라이언트 감시 시작 |
| `npm start` | 감시 모드 없이 시작 |
| `npm test` | Node 테스트 실행 |
| `npm run check` | 소스 구문, 테스트 및 MySQL 스키마 검증 |
| `npm run db:setup` | Prisma 클라이언트 생성 및 MySQL 스키마 반영 |
| `npm run db:reset` | 구성된 MySQL 데이터베이스 초기화 |
| `npm run db:studio` | 구성된 MySQL 데이터베이스용 Prisma Studio 열기 |
| `npm run prisma:generate` | MySQL Prisma 클라이언트 생성 |
| `npm run migrate` | 커밋된 운영 마이그레이션 적용 |

### 환경 변수

시작 시 필수:

- `DATABASE_URL`: 모든 환경에서 사용하는 MySQL 연결 URL
- `JWT_SECRET`: 32자 이상의 강력한 JWT 서명 비밀 값

선택적 서비스 설정:

- `CORS_ORIGIN`: 쉼표로 구분한 허용 웹 출처
- `PUBLIC_URL`: 초대 링크에 사용하는 외부 접근 가능 주소
- `TURN_URLS`, `TURN_SECRET`: 통화 릴레이 설정
- `ADMIN_USER_IDS`, `SENTRY_DSN`: 운영 및 모니터링 소유권
- `APPLE_TEAM_ID`, `ANDROID_CERT_SHA256`: 앱 링크 서명 식별자

일반적인 선택 설정:

- `GOOGLE_WEB_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID`,
  `GOOGLE_ANDROID_CLIENT_ID`: 허용할 Google 토큰 대상
- `APPLE_CLIENT_ID`: 허용할 Apple 토큰 대상

모든 실행에 `.env.example`을 사용하세요. 예제 값은 실행 전에 실제 비밀 값과
서비스 주소로 교체해야 합니다.

### 데이터 소유권

Prisma에는 사용자, 대화, 메시지와 반응이 저장됩니다. 변경 사항은 권한 확인 후
참여자 사용자 방으로 중계되며 오프라인 클라이언트는 다음 동기화에서 기록을 받습니다.

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
| `POST` | `/api/auth/login` | 사용자명, 이메일 또는 전화번호로 로그인 |
| `POST` | `/api/auth/social` | Google 또는 Apple로 인증 |
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

1. 관리형 MySQL, 자동 백업과 복원 시험, `/data/uploads` 영구 볼륨을 준비합니다.
2. MySQL `DATABASE_URL`, 강력한 `JWT_SECRET`, `PUBLIC_URL`, `CORS_ORIGIN`,
    관리자, Sentry, 앱 링크 서명 및 공급자 설정을 구성합니다.
3. 통화 릴레이용 Coturn을 배포하고 다중 서버 인스턴스에는 Redis를 구성합니다.
4. 루트 `Dockerfile`을 HTTPS 역방향 프록시 뒤에 배포합니다. 컨테이너 시작 시
    커밋된 Prisma 마이그레이션이 적용됩니다.
5. `/health`, `/ready`, 법률 페이지, 앱 링크 파일 및
    `npm run smoke:release`를 운영 주소에서 검증합니다.
6. 백업 복원을 시험하고 Sentry 서버 이벤트와 운영자 신고 대기열 접근을 확인합니다.

---

## 日本語

サーバーは認証、招待制アクセス、連絡先と会話のメタデータ、プロフィール
メディア、リアルタイムSocket.io中継を提供し、メッセージとリアクションを永続化します。

### ローカルセットアップ

```powershell
npm install
Copy-Item .env.example .env
npm run db:setup
npm run dev
```

ローカル開発と本番環境の両方でMySQLを使用します。空のデータベースでは
最初のアカウントを招待なしで登録でき、それ以降は未使用かつ有効期限内の
招待が必要です。

`npm run dev`はNext.jsユーザーインターフェースとカスタムNodeサーバーから
API、Socket.io、`/app/` Webクライアントを提供します。Next.jsがルートの
`web/`クライアントソースを直接コンパイルします。

### コマンド

| コマンド | 用途 |
| --- | --- |
| `npm run dev` | 統合Web/APIサーバーとクライアント監視を起動 |
| `npm start` | 監視モードなしで起動 |
| `npm test` | Nodeテストを実行 |
| `npm run check` | ソース構文、テスト、MySQLスキーマを検証 |
| `npm run db:setup` | Prismaクライアントを生成しMySQLスキーマを反映 |
| `npm run db:reset` | 設定済みMySQLデータベースをリセット |
| `npm run db:studio` | 設定済みMySQLデータベースのPrisma Studioを開く |
| `npm run prisma:generate` | MySQL Prismaクライアントを生成 |
| `npm run migrate` | コミット済み本番マイグレーションを適用 |

### 環境変数

起動時に必須:

- `DATABASE_URL`: すべての環境で使用するMySQL接続URL
- `JWT_SECRET`: 32文字以上の強力なJWT署名シークレット

任意のサービス設定:

- `CORS_ORIGIN`: カンマ区切りの許可Webオリジン
- `PUBLIC_URL`: 招待リンクに使用する外部公開オリジン
- `TURN_URLS`, `TURN_SECRET`: 通話リレー設定
- `ADMIN_USER_IDS`, `SENTRY_DSN`: 運用および監視の所有者
- `APPLE_TEAM_ID`, `ANDROID_CERT_SHA256`: アプリリンク署名識別子

一般的な任意設定:

- `GOOGLE_WEB_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID`,
  `GOOGLE_ANDROID_CLIENT_ID`: 許可するGoogleトークン対象
- `APPLE_CLIENT_ID`: 許可するAppleトークン対象

すべての実行で`.env.example`を使用します。実行前に例示値を実際の
シークレットとサービスURLへ置き換えてください。

### データ所有権

Prismaにはユーザー、会話、メッセージ、リアクションを保存します。変更は
認可後に参加者のユーザールームへ中継され、オフラインクライアントは次回同期時に履歴を取得します。

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
| `POST` | `/api/auth/login` | ユーザー名、メール、電話番号でログイン |
| `POST` | `/api/auth/social` | GoogleまたはAppleで認証 |
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

1. マネージドMySQL、自動バックアップと復元テスト、`/data/uploads`永続ボリュームを準備します。
2. MySQL `DATABASE_URL`、強力な`JWT_SECRET`、`PUBLIC_URL`、`CORS_ORIGIN`、
    管理者、Sentry、アプリリンク署名、認証プロバイダー設定を構成します。
3. 通話リレー用Coturnを配備し、複数サーバーインスタンスではRedisを構成します。
4. ルート`Dockerfile`をHTTPSリバースプロキシの背後へ配備します。コンテナ起動時に
    コミット済みPrismaマイグレーションが適用されます。
5. `/health`、`/ready`、法的ページ、アプリリンクファイル、
    `npm run smoke:release`を本番オリジンで検証します。
6. バックアップ復元、Sentryサーバーイベント、モデレーターの報告キューアクセスを確認します。

---

## English

The server provides authentication, invitation access, contact and conversation
metadata, persisted messages and media, abuse reports, call signaling, push
notifications, and live Socket.io relays.

### Local Setup

```powershell
npm install
Copy-Item .env.example .env
npm run db:setup
npm run dev
```

Local development and production both use MySQL. The first registered account
bootstraps an empty database without an invitation. Later registrations require
a pending, unexpired invitation.

`npm run dev` serves the Next.js user interface, API, Socket.io, and the
`/app/` browser client from one custom Node server. Node watch mode restarts the
custom server when server source changes; Next.js handles browser client source.

### Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the unified Next.js/API server in watch mode |
| `npm start` | Start without watch mode |
| `npm test` | Run Node tests |
| `npm run check` | Parse source, test, and validate the MySQL schema |
| `npm run db:setup` | Generate the Prisma client and push the MySQL schema |
| `npm run db:reset` | Reset the configured MySQL database |
| `npm run db:studio` | Open Prisma Studio for the configured MySQL database |
| `npm run prisma:generate` | Generate the MySQL Prisma client |
| `npm run migrate` | Apply committed production migrations |

### Environment

Required at startup:

- `DATABASE_URL`: MySQL connection URL used in every environment
- `JWT_SECRET`: strong JWT signing secret with at least 32 characters

Optional service settings:

- `CORS_ORIGIN`: comma-separated allowed web origins
- `PUBLIC_URL`: externally reachable origin used in invitation links
- `TURN_URLS`, `TURN_SECRET`: call relay configuration
- `ADMIN_USER_IDS`, `SENTRY_DSN`: operational and monitoring ownership
- `APPLE_TEAM_ID`, `ANDROID_CERT_SHA256`: app-link signing identifiers

Common optional settings:

- `WEB_CLIENT_URL`: web client frame URL, defaults to same-origin `/app/`
- `GOOGLE_WEB_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID`,
  `GOOGLE_ANDROID_CLIENT_ID`: accepted Google token audiences
- `APPLE_CLIENT_ID`: accepted Apple token audience

Use `.env.example` for every server run. Replace its example values with real
secrets and service URLs before starting the server.

### Data Ownership

Prisma stores users, conversations, messages, and reactions. Changes are
authorized and relayed to participant user rooms; offline clients receive the
persisted history during their next synchronization.

All routes import the singleton client from `src/db/client.js`. Constructing a
Prisma client elsewhere fails `npm run check`.

### HTTP API

All endpoints except bootstrap, registration, login, social auth, invitation
open/preview pages, and health require `Authorization: Bearer <token>`.

#### Authentication

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/auth/bootstrap-status` | Report first-account availability |
| `POST` | `/api/auth/register` | Register with bootstrap or invitation rules |
| `POST` | `/api/auth/login` | Log in by username, email, or phone |
| `POST` | `/api/auth/social` | Authenticate with Google or Apple |
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

Contacts, users, invitations, profile media, and link previews are implemented
under `/api/contacts`, `/api/users`, `/api/invitations`, `/api/media`, and
`/api/link-preview`. Read the route modules for request field details.

Abuse reports are submitted with `POST /api/reports`. Users listed in
`ADMIN_USER_IDS` can page reports with `GET /api/reports` and update review
status with `PATCH /api/reports/:id`.

### Socket.io

Clients authenticate with `auth.token`. Supported client events are
`join_conversation`, `leave_conversation`, `typing`, `stop_typing`,
`message_read`, and `user_status`. Server events include `new_message`,
`message_reacted`, `message_edited`, `message_deleted`, `user_typing`,
`user_stop_typing`, `message_read`, `user_status_changed`, and `user_offline`.

### Production

`looptalk.app` does not currently serve the production backend. Deploy it
before creating native production binaries, in this order:

1. Provision managed MySQL, automated backups with a restore test, and a
    persistent `/data/uploads` volume.
2. Configure the MySQL `DATABASE_URL`, a strong `JWT_SECRET`, `PUBLIC_URL`,
    `CORS_ORIGIN`, moderation, Sentry, app-link signing, and identity-provider
    settings.
3. Deploy Coturn for call relay and configure Redis when running multiple
    server instances.
4. Deploy the root `Dockerfile` behind an HTTPS reverse proxy. The container
    applies committed Prisma migrations during startup.
5. Verify `/health`, `/ready`, legal pages, app-link files, and
    `npm run smoke:release` against the production origin.
6. Prove backup restoration, a Sentry server event, and moderator access to
    the report queue.

See [`docs/LAUNCH_RUNBOOK.md`](../docs/LAUNCH_RUNBOOK.md) for production secrets,
container deployment, native builds, device certification, and store submission.