# LoopTalk Client

## Forum and Data

Forum is the leftmost navigation tab; the app still opens on Messages.
Data is in the tab bar immediately to the right of Contacts, before Settings.
Its on-device library and category browsing are unchanged. Chat headers no
longer show a Data shortcut; the web installation action remains available.

Every signed-in user can create a poll with 2–10 options. Each user can cast
one final vote per poll. Results and their discussion unlock only after voting,
including for the creator. Only voters may read or post comments. Pull to
refresh to see updated results and comments; Load more retrieves older items.
The server enforces these rules, including direct API requests.

Inside Forum, My Contacts is selected by default and shows polls authored by
saved contacts. Public shows polls from every user, including your own.
Contact filtering runs on the device over the paginated public feed; no contact
IDs are sent to the server. Load more checks older posts even when the current
pages contain no contact polls. Adding or removing a contact updates the filter.
These tabs filter discovery only: all polls remain public to signed-in users,
and results/comments still require voting.

The creation and discussion screens explain that forum content and votes are
server-stored and not end-to-end encrypted. Posts show public author names,
not private profile details. All forum UI is available in Korean, English,
and Japanese.
Metro watches the repository root so shared `public` assets used by My Data
resolve in the exported messenger as well as the Next.js source client.
Its resolver uses the client's dependencies consistently to avoid loading a
second React runtime from the website's root dependencies.

## Calls

Voice and video calls use the same bidirectional video channel. A missing,
busy, or denied camera falls back to microphone-only calling; microphone
access is still required. You can see the other participant's camera or
shared screen without having a camera yourself.

During a connected call, use the camera button to switch between voice-only
and camera video, or the screen button to share a screen without hanging up.
Turning the camera off releases it. Screen sharing replaces outgoing camera
video while preserving microphone audio and incoming video. Stopping sharing
(including the browser's Stop sharing action) restores the previous camera,
or returns to voice-only if the camera was off. Pressing the camera button
while sharing switches back to the camera. Shared screens fit within the
remote view rather than being cropped. Minimizing keeps remote audio playing.

Screen capture is available in HTTPS desktop browsers exposing
`getDisplayMedia`, and in rebuilt native Android apps. Browser users choose
a tab, window, or display in the system picker; cancelling leaves the call
unchanged. Some mobile browsers cannot originate screen capture but can still
receive it. Android uses WebRTC's media-projection foreground service and
system consent dialog; the local Expo plugin enables this service at startup.
Rebuild the Android app after changing native permissions or plugins.
iOS can receive shared screens, but originating native iOS sharing is not
enabled: it requires a signed ReplayKit broadcast extension and app group.
Camera and screen switching must be tested on physical native devices.

### Quality and recovery

Capture requests speech processing (echo cancellation, noise suppression,
automatic gain control, mono audio) and an ideal 720p camera rather than a
mandatory minimum resolution. Relaxing camera constraints preserves audio
processing. Camera capture remains optional, including after permission denial.

Codec and congestion-control selection stay with WebRTC instead of rewriting
SDP or chasing bandwidth estimates with an application bitrate ladder.
Negotiated senders use a 48 kbit/s audio ceiling and request high audio priority
where the implementation exposes it. Camera video has a 2 Mbit/s / 30 fps
ceiling and balanced degradation. Screen sharing has a 4 Mbit/s / 15 fps
ceiling, a `detail` content hint where supported, and maintain-resolution
degradation to favor readable text over smooth motion. These are ceilings,
not reserved bandwidth or quality guarantees. Sender updates are serialized,
use fresh parameters, and never invent negotiated encoding entries.

The quality indicator samples the selected ICE transport, per-stream audio
packet loss, jitter, and concealed samples every four seconds. Deterioration
appears immediately; improvement requires three consecutive healthy samples.
Stats reads do not overlap or update a later call.

Only the original caller initiates ICE restarts. A disconnected connection
gets a two-second grace period, then bounded retries with backoff (up to eight
seconds between attempts) within a 30-second recovery window. Both peers
refresh expiring TURN credentials before a restart. New-generation ICE
candidates arriving ahead of their SDP are queued. Socket.IO recovery and
server call-disconnect cleanup allow 45 seconds; a `call:resume` event moves
existing ownership when the authenticated device reconnects with a new socket
ID. This registry is process-local: server restarts and multi-instance call
ownership still need deployment-specific work. Call duration survives
reconnects and is based on wall-clock time, not timer ticks.

A reliable, ordered WebRTC data channel carries only mute and camera/screen
status snapshots. This hides stopped video immediately rather than waiting
for receiver mute events, labels screen sharing, and preserves screen aspect
ratio. Older peers without this channel fall back to track events.
Microphone disconnection is visible; reconnect it and use the microphone
button to reacquire audio without disrupting the video or shared screen.
Cancelled calls invalidate pending media requests and release late captures.
Incoming invitation replays retain their original 45-second ringing deadline;
expired invitations do not ring. Deliberate cancellation also suppresses late
permission/picker errors instead of showing an error over a later call.

Browser autoplay failures are logged and expose an **Enable call audio**
action, with retries on user gestures. The browser manages speaker/headset
selection; there is no misleading web speaker toggle. Native startup uses
automatic audio routing so connected headsets are not forcibly overridden;
the native speaker toggle remains an explicit override.

Implementation guidance:
[WebRTC sender parameters](https://www.w3.org/TR/webrtc/#dom-rtcrtpsender-setparameters),
[content hints](https://www.w3.org/TR/mst-content-hint/),
[ICE restarts](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Session_lifetime),
and [autoplay policy](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay).
The [release runbook](../docs/LAUNCH_RUNBOOK.md) lists the network and device
checks required before claiming production readiness.

## Appearance

Onboarding keeps pagination and the Next/Start button outside its horizontal
slider, with at least 20px of bottom spacing (or the device safe-area inset,
whichever is larger). Each slide scrolls vertically in short windows or with
larger text, so its content cannot push the controls out of view.

The web and native messengers share the palette in
[`useAppTheme.js`](src/hooks/useAppTheme.js). Light mode uses warm ivory
(`#FAFAF7`), navy headers and sent messages, teal controls, and coral unread
badges. Dark mode uses charcoal (`#1C1F26`), slate headers and received messages,
blue sent messages (`#5C9EFF`), mint presence indicators, and amber unread
badges. Filled controls use a deeper blue for readable white labels; blue
message bubbles and coral/amber badges use dark text for contrast.
Settings supports Light, Dark, and System; switching themes does not change
layout, navigation, or message behavior.

### Brand assets

The coral and mint speech bubbles with scattering colored pixels are based on
the supplied artwork. The background-free vector master is
[`app-icon.svg`](../public/site/app-icon.svg). Website branding and the native
[`BrandMark`](src/components/BrandMark.js) use this design consistently.
Run `npm run branding:generate` from the repository root after editing the master
to regenerate the PNGs and multi-resolution favicon using the existing Sharp
installation. Logos, splash artwork, browser/PWA icons, and Android adaptive
foregrounds are transparent. iOS launcher and Apple touch icons have an opaque
light background. The Android foreground fits within the circular safe zone;
notifications use a separate white silhouette instead of a full-color launcher
icon. Native launcher/splash changes require a new app build.

## Invitation entry

The invitation entry screen uses neutral wording whether or not a visitor has
been invited. It explains the invitation-only requirement and directs visitors
without a code to request one from an existing member. Entering a code still
requires validation before registration.

## My Data

The My Data tab sits immediately before Settings on native and web clients.
Its clickable block histogram compares **item counts**, not disk usage, for
text, images (including drawings), video, audio, and files. Each category opens
a searchable list or image/video gallery. All Items and tag chips also open
the browser. It includes only the signed-in account's locally saved
conversation records and pending messages, including conversations not currently
listed by the server. Deleted messages and queued edit/delete/reaction operations
are excluded, and queued copies are deduplicated against saved messages.
It does not expose sign-in secrets or fetch remote message history.

Open an item to view its text or locally available attachment and edit up to
10 comma-separated tags (32 characters each). Tags persist per account using
the existing private-record storage and owner-account encryption. They remain
on this device and are not shared with chat participants. Search matches
content, filenames, and tags; tag filters work across conversations. Media is
resolved lazily from existing private storage; missing files show an explicit
unavailable state rather than fetching a remote replacement. Refresh or return
to the tab to reload local records. Storage failures show a retry action.

Microsoft OneDrive, Google Drive, Apple iCloud, and Dropbox cards below the
histogram are explicitly disconnected **previews**. There is no OAuth flow,
backup, sync, upload, or provider credential storage in this feature.
Provider cards use the corresponding Material Design brand glyphs in grayscale,
matching the website marks. The app uses its existing bundled icon font;
no logos are requested from third-party servers at runtime.
Below the cloud providers, a personal NAS card previews planned storage and
sync support for a NAS at home or work. It is marked coming soon and not
connected; NAS connections, backup, and sync are not implemented.

## Web app installation

On web, the Messages header has a top-right install icon. It is absent from
Settings and from native iOS/Android apps. Standalone mode, Safari standalone,
the browser's related-apps API (when available), and a saved installation
marker hide the action for installed apps. Browser APIs cannot universally
detect installations made outside this browser or after storage is cleared.
A fresh browser install offer clears a previous marker after an uninstall.

The icon opens the browser installation prompt when available; otherwise it
explains how to install through the browser menu or the iOS/iPadOS Share menu.
Insecure origins show an HTTPS requirement instead. This installs the React
messenger as a standalone PWA; it is not a separate React download or native
binary. The manifest has real 192px and 512px icons, and the exported and
Next.js clients provide the same manifest and an Apple touch icon.
Chrome/Edge may wait for browser engagement criteria before providing a prompt.
The flow uses the browser's `beforeinstallprompt.prompt()` result, with
`userChoice` compatibility, and prompts only from a user click. No experimental
installation API or extra React/PWA dependency is needed.
See [Chrome install criteria](https://web.dev/articles/install-criteria) and
[custom install guidance](https://web.dev/articles/customize-install).
Service-worker caching is not required for this installation flow; this change
does not add offline startup support.
The web messenger popup defaults to 520px wide (capped to the available screen
width) to leave room for the browser's installation dialog.
Only confirmed installation events or detected installed launches send
telemetry, once per anonymous browser installation ID. Dismissals and clicks
are not counted. Failed telemetry reports are logged and retried every minute
while the Messages header is mounted, or when connectivity returns.

Settings starts with the owner-only encrypted profile: photo, display name, and
bio. The randomly assigned public account ID is immutable. Users can optionally
reserve a public username to be found by exact ID/username search; it is separate
from the private profile name. Presence appears before the
profile separator; the remaining settings follow below it. Registration dates
are not displayed on profiles.
Online status comes from foreground activity on any connected device, not the
account's `ACTIVE` status. Background/disconnect updates, reconnect snapshots,
and one-minute foreground heartbeats keep presence consistent across Settings,
profiles, contacts, messages, and chat headers. Offline users show their stored
`lastActiveAt`; accounts without recorded activity do not show an invented date.
Restart the backend after updating it so the new presence handlers take effect.

Private signup uses email + password or phone + password. Contact identifiers
are sent over HTTPS and encrypted at rest for credential lookup. Passwords stay
on the client: PBKDF2-HMAC-SHA256 (600,000 iterations, random 16-byte account salt)
derives separate authentication/encryption keys. Login uses an Ed25519
single-use challenge. No recovery phrase or OTP is required in phase one.
The server syncs only ciphertext for the profile/contact/preferences vault.
Browser sessions and derived keys are memory-only; refresh requires signing in
again. Native derived material and sessions use operating-system secure
storage. Group names are owner-only encrypted labels, not shared server names.
The invitation-chain map shows a labeled demonstration below 100 users and
real topology from 100 users, without publishing account IDs or private profiles.

Private signup does not create a readable operator welcome chat.
Chat positioning preserves layout/content measurements
that arrive before the history-loading effect, so the first open does not wait
indefinitely for a second layout event. The initial content measurement is also
valid when a short history leaves the empty list's height unchanged. Empty
chats also finish loading.

[한국어](#한국어) | [日本語](#日本語) | [English](#english)

## 한국어

클라이언트는 iOS 및 Android를 지원하는 Expo SDK 57 네이티브 애플리케이션입니다.
React Navigation은 화면 흐름을, Zustand는 애플리케이션 상태를 관리하며,
Socket.io는 일시적인 메시지 이벤트를 전달합니다.

### 설정

```sh
npm ci
npm start
```

`.env.example`을 운영체제의 파일 관리자 또는 복사 명령으로 `.env`에 복사한 뒤 앱을 시작하세요.

| 명령어 | 용도 |
| --- | --- |
| `npm start` | Expo 개발 서버 시작 |
| `npm run android` | Android에서 시작 및 열기 |
| `npm run ios` | iOS에서 시작 및 열기(macOS 도구 필요) |
| `npm run check` | Expo Doctor 실행 |

### 구성

`EXPO_PUBLIC_API_URL`은 HTTP 및 Socket.io 서버 주소이며 기본값은
`http://localhost:3001`입니다. 실제 휴대전화에서는 개발 컴퓨터의
`localhost`에 연결할 수 없으므로 컴퓨터의 LAN 주소를 사용하세요.
Android 에뮬레이터에서는 `http://10.0.2.2:3001`을 사용하고, iOS 시뮬레이터에서는
`localhost`를 사용할 수 있습니다. 실제 기기 연결을 위해 컴퓨터 방화벽에서 3001 포트를 허용하세요.

Google 소셜 인증은 다음 선택적 변수도 사용합니다.

- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
- `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`
- `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`

### 운영 빌드 상태

- EAS 프로젝트 `@eddiec2025/looptalk`가 연결되어 있으며 프로젝트 ID는
	`app.json`에 저장됩니다.
- Android 운영 키스토어는 EAS에 생성되어 있습니다.
- `looptalk.app` 운영 API, EAS 운영 환경 변수, Sentry 프로젝트 및 iOS 서명은
	아직 구성해야 합니다.
- 운영 API가 HTTPS로 배포된 후 `EXPO_PUBLIC_API_URL`과
	`EXPO_PUBLIC_SENTRY_DSN`을 EAS `production` 환경에 설정하세요. 필요한 경우
	Google OAuth 클라이언트 ID와 Sentry 소스맵 자격 증명도 추가합니다.
- iOS 자격 증명을 구성한 다음 `eas build --platform all --profile production`을
	실행하고 실제 기기 검증을 완료하기 전에는 스토어에 제출하지 마세요.

### 소스 구조

```text
src/
|-- api/          Axios 요청 모듈
|-- components/   공유 프레젠테이션 컴포넌트
|-- hooks/        테마 및 번역 훅
|-- i18n/         현재 한국어만 사용하는 현지화 문자열
|-- navigation/   인증 및 애플리케이션 내비게이터
|-- screens/      경로 단위 UI
|-- storage/      계정별 로컬 메시지 저장소 및 아카이브 형식
|-- store/        인증, 연락처, 메시지 및 환경 설정
`-- utils/        클립보드 및 입력 검증 도우미
```

### 메시지 수명 주기

1. `messageStore`가 인증된 Socket.io 연결 하나를 엽니다.
2. `ChatScreen`이 마운트된 동안 해당 대화방에 참여합니다.
3. 새 개인·그룹 메시지와 첨부 파일을 기기에서 암호화하고 로컬 기록·재전송 큐에 저장합니다.
4. 서버에는 암호문만 보내며, 수신 기기는 비공개 파일 또는 IndexedDB 저장 후 ACK를 보냅니다.
5. 모든 대상 기기가 저장을 확인하면 서버가 임시 암호문을 삭제합니다. 운영자 대화만 기존 경로를 사용합니다.

반응, 수정 및 삭제 이벤트도 같은 로컬 병합 경로를 사용합니다. Socket이
재연결되면 활성 대화방에 다시 참여합니다. 로그아웃하면 Socket 연결을 끊고
메모리의 메시지 상태를 초기화합니다.

대화 기록은 로컬에 있으므로 앱 저장소를 지우면 함께 삭제됩니다. 저장소 모듈은
버전이 지정된 아카이브 형식을 제공하지만 원격 백업 어댑터는 아직 없습니다.

### 개발 참고 사항

- 네트워크 호출은 `src/api`, 영구 상태 전환은 store에 유지하세요.
- UI 값을 하드코딩하지 말고 `useAppTheme`과 `useTranslation`을 사용하세요.
- 이전 로컬 아카이브를 읽을 때 발신자 메타데이터가 없을 수 있습니다.
- 의존성 또는 Expo 구성을 바꾼 후 `npm run check`를 실행하세요.
- 전체 검사는 `npm run check` 후 EAS preview 프로필로 Android 또는 iOS 빌드를 실행합니다.

새 개인 미디어는 암호화된 전달 안에 포함하며, 수신 후 기기에 보관합니다.
프로필·운영자 첨부 파일은 서버 업로드를 사용합니다.
키 신뢰, 재시도, 기기 손실, 아카이브 v2 및 배포 한계는
[암호화 메시징 문서](../docs/ENCRYPTED_MESSAGING.md)를 확인하세요.

---

## 日本語

クライアントはiOSとAndroidに対応するExpo SDK 57ネイティブアプリケーションです。
React Navigationが画面遷移を、Zustandがアプリケーション状態を管理し、
Socket.ioが一時的なメッセージイベントを配信します。

### セットアップ

```sh
npm ci
npm start
```

アプリを起動する前に、OSのファイルマネージャーまたはコピーコマンドで`.env.example`を`.env`へコピーします。

| コマンド | 用途 |
| --- | --- |
| `npm start` | Expo開発サーバーを起動 |
| `npm run android` | Androidで起動して開く |
| `npm run ios` | iOSで起動して開く（macOSツールが必要） |
| `npm run check` | Expo Doctorを実行 |

### 設定

`EXPO_PUBLIC_API_URL`はHTTPおよびSocket.ioサーバーのオリジンで、既定値は
`http://localhost:3001`です。実機は開発用コンピューターの`localhost`を
利用できないため、コンピューターのLANアドレスを設定してください。Androidエミュレーターでは
`http://10.0.2.2:3001`、iOSシミュレーターでは`localhost`を使用できます。
実機から接続する場合は、コンピューターのファイアウォールでポート3001を許可してください。

Googleソーシャル認証では、次の任意変数も使用します。

- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
- `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`
- `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`

### 本番ビルド状況

- EASプロジェクト`@eddiec2025/looptalk`はリンク済みで、プロジェクトIDは
	`app.json`に保存されています。
- Android本番キーストアはEASに作成済みです。
- `looptalk.app`本番API、EAS本番環境変数、Sentryプロジェクト、iOS署名は
	まだ設定が必要です。
- 本番APIをHTTPSで配備した後、`EXPO_PUBLIC_API_URL`と
	`EXPO_PUBLIC_SENTRY_DSN`をEASの`production`環境へ設定してください。
	必要に応じてGoogle OAuthクライアントIDとSentryソースマップ資格情報も追加します。
- iOS資格情報を設定して`eas build --platform all --profile production`を実行し、
	実機検証を完了するまではストアへ提出しないでください。

### ソース構成

```text
src/
|-- api/          Axiosリクエストモジュール
|-- components/   共有表示コンポーネント
|-- hooks/        テーマおよび翻訳フック
|-- i18n/         現在は韓国語のみを使用するローカライズ文字列
|-- navigation/   認証およびアプリケーションナビゲーター
|-- screens/      ルート単位のUI
|-- storage/      アカウント別ローカルメッセージ保存とアーカイブ形式
|-- store/        認証、連絡先、メッセージ、設定
`-- utils/        クリップボードおよび入力検証ヘルパー
```

### メッセージのライフサイクル

1. `messageStore`が認証済みSocket.io接続を1つ開きます。
2. `ChatScreen`がマウントされている間、会話ルームに参加します。
3. 新しい個人・グループメッセージと添付ファイルを暗号化し、ローカル履歴と再送キューに保存します。
4. 受信端末は非公開ファイルまたはIndexedDBに保存してからACKを送ります。
5. 全対象端末の保存確認後、サーバーは暗号文を削除します。運営者との会話は従来の経路を使います。

リアクション、編集、削除イベントも同じローカル統合経路を使用します。
Socketの再接続時にはアクティブな会話へ再参加します。ログアウト時には
Socketを切断し、メモリ内のメッセージ状態を消去します。

履歴はローカル保存のため、アプリストレージを消去すると削除されます。
ストレージモジュールにはバージョン付きアーカイブ形式がありますが、
リモートバックアップアダプターは未設定です。

### 開発上の注意

- ネットワーク呼び出しは`src/api`、永続状態の遷移はstoreに配置します。
- UI値をハードコードせず、`useAppTheme`と`useTranslation`を使用します。
- 古いローカルアーカイブでは送信者メタデータがない場合があります。
- 依存関係やExpo設定の変更後は`npm run check`を実行します。
- 完全な確認には`npm run check`の後、EAS previewプロファイルでAndroidまたはiOSをビルドします。

新しい個人メディアは暗号化され、受信後は端末に保存されます。
以前のメディア、プロフィール、運営者の添付ファイルは既存のサーバー保存を使います。
[プロトコルと制限](../docs/ENCRYPTED_MESSAGING.md)を確認してください。

---

## English

The client is an Expo SDK 57 native application for iOS and Android. React
Navigation owns screen flow, Zustand owns application state, and Socket.io
delivers transient messaging events.

### Setup

```sh
npm ci
npm start
```

Copy `.env.example` to `.env` with your operating system's file manager or
copy command before starting the app.

Available commands:

| Command | Purpose |
| --- | --- |
| `npm start` | Start the Expo development server |
| `npm run android` | Start and open Android |
| `npm run ios` | Start and open iOS (requires macOS tooling) |
| `npm run check` | Run Expo Doctor |

### Configuration

`EXPO_PUBLIC_API_URL` is the HTTP and Socket.io server origin. It defaults to
`http://localhost:3001`. A physical phone cannot use the development computer's
`localhost`; set the variable to the computer's LAN address instead.
Use `http://10.0.2.2:3001` from an Android emulator; an iOS simulator can use
`localhost`. Allow port 3001 through the computer's firewall for physical devices.

Google social authentication also uses these optional variables:

- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
- `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`
- `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`

### Production Build Status

- EAS project `@eddiec2025/looptalk` is linked; its project ID is persisted in
	`app.json`.
- The Android production keystore has been generated and stored in EAS.
- The `looptalk.app` production API, EAS production variables, Sentry project,
	and iOS signing still require configuration.
- After the production API is live on HTTPS, set `EXPO_PUBLIC_API_URL` and
	`EXPO_PUBLIC_SENTRY_DSN` in the EAS `production` environment. Add Google
	OAuth client IDs and Sentry source-map credentials when those providers are
	enabled.
- Configure iOS credentials, run
	`eas build --platform all --profile production`, and complete physical-device
	certification before submitting either binary.

### iOS App Store Release

A Mac is not required to build or submit the iOS app. EAS builds it on Expo's
cloud macOS builders, and EAS Submit can upload it to App Store Connect. A Mac
is needed for local iOS Simulator builds and other local Xcode workflows; test
the signed release on physical iPhones before submission.

App Store distribution requires Apple Developer Program membership and access
to App Store Connect for `com.looptalk.app`. Before submitting, deploy and
verify the production HTTPS service, configure EAS production variables and iOS
signing, complete the real-device release checks, and prepare store screenshots,
privacy disclosures, and a working reviewer account. LoopTalk is invitation-
only, so include access instructions in the private review notes.

```bash
npx eas-cli@latest build --platform ios --profile production
npx eas-cli@latest submit --platform ios --profile production
```

See [the launch runbook](../docs/LAUNCH_RUNBOOK.md) for the complete release
gates and [the store listing](../docs/STORE_LISTING.md) for listing and review
requirements.

### Source Layout

```text
src/
|-- api/          Axios request modules
|-- components/   Shared presentation components
|-- hooks/        Theme and translation hooks
|-- i18n/         Localization strings currently locked to Korean
|-- navigation/   Authentication and application navigators
|-- screens/      Route-level UI
|-- storage/      Per-account local message persistence and archive format
|-- store/        Auth, contacts, messages, and preferences
`-- utils/        Clipboard and input validation helpers
```

### Message Lifecycle

1. `messageStore` opens one authenticated Socket.io connection.
2. `ChatScreen` joins its conversation room while mounted.
3. New private/group messages and attachments are encrypted and saved locally with a stable retry record.
4. Recipients save to private files or IndexedDB before ACK; socket hints contain no content.
5. Every addressed device's storage confirmation deletes the server ciphertext. Operator WELCOME conversations use the server-readable path.

The same local merge path handles reaction, edit, and deletion events. Socket
reconnection rejoins the active conversation. Signing out disconnects the
socket and clears in-memory message state.

Because history is local, clearing application storage removes it. The storage
module exposes a versioned archive format, but no remote backup adapter is
configured yet.

### Development Notes

- Keep network calls in `src/api` and persistent state transitions in stores.
- Use `useAppTheme` and `useTranslation` rather than hard-coded UI values.
- Treat message sender metadata as optional when reading older local archives.
- Run `npm run check` after dependency or Expo configuration changes.
- For full validation, run `npm run check`, then build Android or iOS with the EAS preview profile.

New private media is inside encrypted deliveries and remains local after receipt.
Profile/operator uploads need persistent server storage. See
[protocol, device trust, archive v2, and recovery limitations](../docs/ENCRYPTED_MESSAGING.md).