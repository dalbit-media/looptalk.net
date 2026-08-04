# LoopTalk Client

[한국어](#한국어) | [日本語](#日本語) | [English](#english)

## 한국어

클라이언트는 iOS 및 Android를 지원하는 Expo SDK 57 네이티브 애플리케이션입니다.
React Navigation은 화면 흐름을, Zustand는 애플리케이션 상태를 관리하며,
Socket.io는 일시적인 메시지 이벤트를 전달합니다.

### 설정

```powershell
npm install
Copy-Item .env.example .env
npm start
```

| 명령어 | 용도 |
| --- | --- |
| `npm start` | Expo 개발 서버 시작 |
| `npm run android` | Android에서 시작 및 열기 |
| `npm run ios` | iOS에서 시작 및 열기(macOS 도구 필요) |
| `npm run check` | Expo Doctor 실행 |

### 구성

`EXPO_PUBLIC_API_URL`은 HTTP 및 Socket.io 서버 주소이며 기본값은
`http://localhost:3000`입니다. 실제 휴대전화에서는 개발 컴퓨터의
`localhost`에 연결할 수 없으므로 컴퓨터의 LAN 주소를 사용하세요.

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
|-- i18n/         한국어, 영어 및 일본어 문자열
|-- navigation/   인증 및 애플리케이션 내비게이터
|-- screens/      경로 단위 UI
|-- storage/      계정별 로컬 메시지 저장소 및 아카이브 형식
|-- store/        인증, 연락처, 메시지 및 환경 설정
`-- utils/        클립보드 및 입력 검증 도우미
```

### 메시지 수명 주기

1. `messageStore`가 인증된 Socket.io 연결 하나를 엽니다.
2. `ChatScreen`이 마운트된 동안 해당 대화방에 참여합니다.
3. 텍스트를 보내면 서버 중계 엔드포인트를 호출합니다.
4. 발신자와 온라인 참여자가 `new_message`를 수신합니다.
5. 각 클라이언트가 이벤트를 계정별 AsyncStorage 기록에 병합합니다.

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

미디어 메시지는 서버에 업로드되며 운영 환경에서는 업로드 디렉터리에 영구
볼륨을 연결해야 합니다.

---

## 日本語

クライアントはiOSとAndroidに対応するExpo SDK 57ネイティブアプリケーションです。
React Navigationが画面遷移を、Zustandがアプリケーション状態を管理し、
Socket.ioが一時的なメッセージイベントを配信します。

### セットアップ

```powershell
npm install
Copy-Item .env.example .env
npm start
```

| コマンド | 用途 |
| --- | --- |
| `npm start` | Expo開発サーバーを起動 |
| `npm run android` | Androidで起動して開く |
| `npm run ios` | iOSで起動して開く（macOSツールが必要） |
| `npm run check` | Expo Doctorを実行 |

### 設定

`EXPO_PUBLIC_API_URL`はHTTPおよびSocket.ioサーバーのオリジンで、既定値は
`http://localhost:3000`です。実機は開発用コンピューターの`localhost`を
利用できないため、コンピューターのLANアドレスを設定してください。

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
|-- i18n/         韓国語、英語、日本語の文字列
|-- navigation/   認証およびアプリケーションナビゲーター
|-- screens/      ルート単位のUI
|-- storage/      アカウント別ローカルメッセージ保存とアーカイブ形式
|-- store/        認証、連絡先、メッセージ、設定
`-- utils/        クリップボードおよび入力検証ヘルパー
```

### メッセージのライフサイクル

1. `messageStore`が認証済みSocket.io接続を1つ開きます。
2. `ChatScreen`がマウントされている間、会話ルームに参加します。
3. テキスト送信時にサーバーの中継エンドポイントを呼び出します。
4. 送信者とオンライン参加者が`new_message`を受信します。
5. 各クライアントがイベントをアカウント別AsyncStorage履歴へ統合します。

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

メディアメッセージはサーバーへアップロードされます。本番環境では
アップロードディレクトリに永続ボリュームを接続してください。

---

## English

The client is an Expo SDK 57 native application for iOS and Android. React
Navigation owns screen flow, Zustand owns application state, and Socket.io
delivers transient messaging events.

### Setup

```powershell
npm install
Copy-Item .env.example .env
npm start
```

Available commands:

| Command | Purpose |
| --- | --- |
| `npm start` | Start the Expo development server |
| `npm run android` | Start and open Android |
| `npm run ios` | Start and open iOS (requires macOS tooling) |
| `npm run check` | Run Expo Doctor |

### Configuration

`EXPO_PUBLIC_API_URL` is the HTTP and Socket.io server origin. It defaults to
`http://localhost:3000`. A physical phone cannot use the development computer's
`localhost`; set the variable to the computer's LAN address instead.

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

### Source Layout

```text
src/
|-- api/          Axios request modules
|-- components/   Shared presentation components
|-- hooks/        Theme and translation hooks
|-- i18n/         Korean, English, and Japanese strings
|-- navigation/   Authentication and application navigators
|-- screens/      Route-level UI
|-- storage/      Per-account local message persistence and archive format
|-- store/        Auth, contacts, messages, and preferences
`-- utils/        Clipboard and input validation helpers
```

### Message Lifecycle

1. `messageStore` opens one authenticated Socket.io connection.
2. `ChatScreen` joins its conversation room while mounted.
3. Sending text calls the server relay endpoint.
4. The sender and online participants receive `new_message`.
5. Each client merges the event into its account-scoped AsyncStorage history.

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

Media messages upload to the server. Production deployments must mount a
persistent volume for the upload directory.