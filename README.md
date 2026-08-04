# LoopTalk

[한국어](#한국어) | [日本語](#日本語) | [English](#english)

## 한국어

LoopTalk은 Expo React Native 네이티브 클라이언트와 Next.js 웹 클라이언트,
Socket.io 서버로 만든 초대 전용 메신저입니다. 클라이언트는 계정별 대화 기록을 캐시하며, 서버는
메시지를 영구 저장하고 대화 권한 확인과 실시간 이벤트 중계를 담당합니다.

### 현재 기능

구현된 기능:

- 이메일 또는 전화번호 가입, 최초 사용자 등록, 초대 기반 가입
- 공급자 인증 정보 설정 시 Google 및 Apple 로그인
- 일대일 및 그룹 대화 메타데이터 관리
- 실시간 텍스트, 입력 상태, 반응, 수정 및 삭제 이벤트 중계
- React Native AsyncStorage 기반 계정별 대화 기록
- 연락처 그룹, 즐겨찾기, 프로필 및 차단
- 한국어, 영어 및 일본어 인터페이스
- 라이트, 다크 및 시스템 테마
- 프로필 사진 업로드 및 인증된 링크 미리보기 조회
- 파일 공유, 오프라인 텍스트 재전송, 읽음 상태 및 푸시 알림
- 일대일 음성/영상 통화, 웹 화면 공유 및 그룹 관리자 역할
- 사용자/메시지 신고, 차단 및 앱 내 계정 삭제

현재 제약 사항:

- 업로드 파일은 로컬 디스크에 저장되므로 운영 환경에는 영구 볼륨이 필요합니다.
- 종단 간 암호화와 원격 미디어 저장소는 아직 구현되지 않았습니다.
- 메시지 검색, 스티커, 봇, 네이티브 화면 공유 및 종단 간 암호화는 아직 구현되지 않았습니다.

### 출시 상태

소스 코드는 출시 후보 상태입니다. 서버 검사 10개, 두 Prisma 스키마,
Expo Doctor 20개 검사, 웹 운영 빌드, 핵심 릴리스 스모크 테스트 및 운영 의존성
감사가 통과합니다. EAS 프로젝트 `@eddiec2025/looptalk`가 연결되어 있고 Android
운영 키스토어도 EAS에 생성되어 있습니다.

남은 작업은 외부 운영 작업입니다. `looptalk.app`에 HTTPS 서버를 배포하고 MySQL,
Redis(다중 인스턴스인 경우), Coturn, 영구 업로드 볼륨, 백업, Sentry 및 운영 이메일을
구성해야 합니다. 그 다음 EAS 운영 환경 변수와 iOS 서명 자격 증명을 설정하고 서명된
iOS/Android 빌드를 실제 기기에서 검증한 후 스토어 심사를 제출하세요. 정확한 순서와
완료 조건은 [출시 실행서](docs/LAUNCH_RUNBOOK.md)를 따릅니다.

### 구조

```text
LoopTalk/
|-- app/                Next.js 웹사이트 및 브라우저 경로
|-- web/                브라우저 메신저 소스
|-- mobile/             iOS/Android Expo 애플리케이션
|   |-- App.js
|   `-- src/
|       |-- api/        HTTP 클라이언트
|       |-- screens/    화면
|       |-- storage/    로컬 대화 기록
|       `-- store/      Zustand 상태 및 Socket.io 수명 주기
`-- server/             Next.js 및 Socket.io 서버
    |-- prisma/         MySQL Prisma 스키마 및 마이그레이션
    |-- scripts/        프로젝트 검사 도구
    |-- src/
    |   |-- config/     시작 환경 검증
    |   |-- db/         공유 Prisma 클라이언트
    |   `-- routes/     HTTP API
    `-- test/           Node 테스트
```

서버 데이터베이스에는 계정, 연락처, 초대, 대화 참여 정보, 메시지, 반응,
기기 토큰 및 차단 정보가 저장됩니다.

### 로컬 실행

Node.js 18 이상과 npm이 필요합니다.

서버:

```powershell
Set-Location server
npm install
Copy-Item .env.example .env
npm run db:setup
npm run dev
```

클라이언트:

```powershell
Set-Location client
npm install
Copy-Item .env.example .env
npm start
```

로컬 API 주소는 `http://localhost:3000`입니다. 비어 있는 데이터베이스의
첫 계정은 초대 없이 생성할 수 있으며 이후 계정에는 초대가 필요합니다.
실제 기기에서는 `EXPO_PUBLIC_API_URL`을 개발 컴퓨터의 접근 가능한 LAN
주소로 설정해야 합니다.

### 검사

변경 사항을 제출하기 전에 두 프로젝트의 검사를 실행하세요.

```powershell
Set-Location server
npm run check

Set-Location ..\client
npm run check
```

서버 검사는 JavaScript 구문, Prisma 클라이언트 공유 규칙, 단위 테스트 및
두 Prisma 스키마를 확인합니다. 클라이언트 검사는 Expo Doctor를 실행합니다.

### 문서

- [모바일 앱 안내서](mobile/README.md)
- [서버 및 API 안내서](server/README.md)
- [라이선스](LICENSE)

---

## 日本語

LoopTalkは、Expo React Nativeネイティブクライアント、Next.js Webクライアント、
Socket.ioサーバーで構築された招待制メッセンジャーです。クライアントはアカウントごとの会話履歴を
キャッシュし、サーバーはメッセージを永続化して会話権限の確認とリアルタイム
イベントの中継を行います。

### 現在の機能

実装済み:

- メールアドレスまたは電話番号による登録、初回ユーザー登録、招待制アクセス
- プロバイダー認証情報を設定した場合のGoogleおよびAppleログイン
- ダイレクトおよびグループ会話のメタデータ管理
- テキスト、入力状態、リアクション、編集、削除イベントのリアルタイム中継
- React Native AsyncStorageによるアカウント別の会話履歴
- 連絡先グループ、お気に入り、プロフィール、ブロック
- 韓国語、英語、日本語のインターフェース
- ライト、ダーク、システムテーマ
- プロフィール画像のアップロードと認証済みリンクプレビュー取得
- ファイル共有、オフラインテキスト再送、既読状態、プッシュ通知
- 1対1の音声/ビデオ通話、Web画面共有、グループ管理者ロール
- ユーザー/メッセージ報告、ブロック、アプリ内アカウント削除

現在の制約:

- アップロードはローカルディスクに保存されるため、本番環境には永続ボリュームが必要です。
- エンドツーエンド暗号化とリモートメディアストレージは未実装です。
- メッセージ検索、ステッカー、ボット、ネイティブ画面共有、エンドツーエンド暗号化は未実装です。

### リリース状況

ソースコードはリリース候補の状態です。サーバーの10チェック、両Prismaスキーマ、
Expo Doctorの20チェック、Web本番ビルド、主要リリーススモークテスト、本番依存関係
監査が成功しています。EASプロジェクト`@eddiec2025/looptalk`はリンク済みで、
Android本番キーストアもEASに作成済みです。

残りは外部運用作業です。`looptalk.app`へHTTPSサーバーを配備し、MySQL、
Redis（複数インスタンスの場合）、Coturn、永続アップロードボリューム、バックアップ、
Sentry、本番メールを設定します。その後、EAS本番環境変数とiOS署名資格情報を設定し、
署名済みiOS/Androidビルドを実機で検証してからストア審査へ提出してください。
正確な順序と完了条件は[リリースランブック](docs/LAUNCH_RUNBOOK.md)に従います。

### 構成

```text
LoopTalk/
|-- app/                Next.jsサイトおよびブラウザルート
|-- web/                ブラウザメッセンジャーソース
|-- mobile/             iOS/Android Expoアプリケーション
|   |-- App.js
|   `-- src/
|       |-- api/        HTTPクライアント
|       |-- screens/    画面
|       |-- storage/    ローカル会話履歴
|       `-- store/      Zustand状態とSocket.ioライフサイクル
`-- server/             Next.jsおよびSocket.ioサーバー
    |-- prisma/         MySQL Prismaスキーマとマイグレーション
    |-- scripts/        プロジェクト検査ツール
    |-- src/
    |   |-- config/     起動時の環境検証
    |   |-- db/         共有Prismaクライアント
    |   `-- routes/     HTTP API
    `-- test/           Nodeテスト
```

サーバーデータベースには、アカウント、連絡先、招待、会話参加情報、
メッセージ、リアクション、デバイストークン、ブロック情報が保存されます。

### ローカル実行

Node.js 18以降とnpmが必要です。

サーバー:

```powershell
Set-Location server
npm install
Copy-Item .env.example .env
npm run db:setup
npm run dev
```

クライアント:

```powershell
Set-Location client
npm install
Copy-Item .env.example .env
npm start
```

ローカルAPIは`http://localhost:3000`で起動します。空のデータベースでは、
最初のアカウントを招待なしで作成でき、それ以降は招待が必要です。
実機では、`EXPO_PUBLIC_API_URL`を開発用コンピューターへ接続できるLAN
アドレスに設定してください。

### 検証

変更を提出する前に、両方のプロジェクト検査を実行してください。

```powershell
Set-Location server
npm run check

Set-Location ..\client
npm run check
```

サーバー検査では、JavaScript構文、Prismaクライアントの共有規則、
ユニットテスト、両方のPrismaスキーマを確認します。クライアント検査では
Expo Doctorを実行します。

### ドキュメント

- [モバイルアプリガイド](mobile/README.md)
- [サーバーおよびAPIガイド](server/README.md)
- [ライセンス](LICENSE)

---

## English

LoopTalk is an invitation-only messenger built with Expo React Native clients
for iOS and Android, a Next.js browser client, and a Socket.io server. Clients cache per-account conversation history,
while the server persists messages, authorizes conversations, and relays live
events.

### Current Capabilities

Implemented:

- Email or phone registration, first-user bootstrap, and invitation access
- Google and Apple identity verification when provider credentials are set
- Direct and group conversation metadata
- Live text relay, typing indicators, reactions, edits, and deletions
- Per-account conversation history in React Native AsyncStorage
- Contacts, fixed contact groups, favorites, profiles, and blocking
- Korean, English, and Japanese interfaces
- Light, dark, and system theme preferences
- Profile-picture upload and authenticated link-preview lookup
- File sharing, offline text retry, read state, and push notifications
- Direct voice/video calling, browser screen sharing, and group administration
- User/message reports, blocking, and in-app account deletion

Current constraints:

- Uploaded media uses local disk and requires a persistent production volume.
- End-to-end encryption and remote media storage are not implemented.
- Message search, stickers, bots, native screen sharing, and end-to-end encryption are not
  implemented.

### Release Status

The source is at release-candidate status. The 10 server checks, both Prisma
schemas, all 20 Expo Doctor checks, the production web export, the critical
release smoke test, and production dependency audits pass. EAS project
`@eddiec2025/looptalk` is linked, and its Android production keystore is stored
in EAS.

The remaining work is external operations: deploy the HTTPS server at
`looptalk.app`; provision MySQL, Redis when scaling beyond one instance,
Coturn, persistent uploads, backups, Sentry, and production email; configure
the EAS production environment and iOS signing; then certify signed iOS and
Android builds on physical devices before store submission. Follow the
[launch runbook](docs/LAUNCH_RUNBOOK.md) for the exact order and release gates.

### Architecture

```text
LoopTalk/
|-- app/                    Next.js website and browser messenger
|-- web/                    Browser messenger source
|-- mobile/                 Native iOS and Android application
|   |-- App.js
|   |-- src/
|   |   |-- api/          HTTP clients
|   |   |-- components/   Shared UI
|   |   |-- navigation/   Auth and application stacks
|   |   |-- screens/      Authentication and application screens
|   |   |-- storage/      Versioned local conversation archives
|   |   `-- store/        Zustand state and Socket.io lifecycle
|   `-- package.json
`-- server/
    |-- prisma/            MySQL Prisma schema and migrations
    |-- scripts/           Repository health checks
    |-- src/
    |   |-- config/        Startup configuration validation
    |   |-- db/            Shared Prisma client
    |   |-- middleware/    Authentication and uploads
    |   |-- routes/        HTTP API
    |   `-- server.js      Next.js custom server and Socket.io entry point
    `-- test/              Node test runner tests
```

The server database contains accounts, contacts, invitations, conversation
membership, messages, reactions, device tokens, and blocks.

### Local Setup

Prerequisites: Node.js 18 or newer and npm.

#### Server

PowerShell:

```powershell
Set-Location server
npm install
Copy-Item .env.example .env
npm run db:setup
npm run dev
```

macOS/Linux:

```bash
cd server
npm install
cp .env.example .env
npm run db:setup
npm run dev
```

The local API listens on `http://localhost:3000`. The first account can be
created without an invitation; every later account requires one.

#### Native Client

PowerShell:

```powershell
Set-Location mobile
npm install
Copy-Item .env.example .env
npm start
```

macOS/Linux:

```bash
cd mobile
npm install
cp .env.example .env
npm start
```

Use `npm run android` or `npm run ios` for a native target. The browser client
is part of the root Next.js application and is available at `/app`.
For a physical device, set `EXPO_PUBLIC_API_URL` to a server address reachable
from that device instead of `localhost`.

### Validation

Run the repository check before submitting changes:

```powershell
Set-Location LoopTalk
npm run check
```

The server check parses all server JavaScript, verifies shared Prisma client
ownership, runs unit tests, and validates both Prisma schemas. The client check
runs Expo Doctor.

For a release build, run `npm run release:prepare`, apply migrations with
`npm run migrate --prefix server`, then start the server.

### Documentation

- [Mobile app guide](mobile/README.md)
- [Server guide and API](server/README.md)
- [Launch runbook](docs/LAUNCH_RUNBOOK.md)
- [Store listing](docs/STORE_LISTING.md)
- [Privacy disclosures](docs/PRIVACY_DISCLOSURES.md)
- [License](LICENSE)

### License

MIT