# LoopTalk

Operator reset (irreversible): stop the server and back up data, then run
`npm run reset` from this directory. It recreates the schema,
deletes database data/uploads, seeds only the non-login system account, and
clears updated clients' app-owned storage when they reconnect.
The npm script includes confirmation and immediately performs the destructive reset.
Direct invocation with `node server/scripts/reset.js` still requires `--confirm-reset`.
See [reset safeguards and client limitations](server/README.md#destructive-reset).
Run `npm run zip` to create `looptalk.zip` from the latest commit (`HEAD`).
Uncommitted changes and untracked files are not included.
The canonical website build is `npm run build`; `build:next`, server
`migrate`, `seed`, and `dev:watch` aliases were removed. Use `db:push`, `db:seed`,
and `dev -- --watch` in the server project instead.

[한국어](#한국어) | [日本語](#日本語) | [English](#english)

## 한국어

LoopTalk은 Expo React Native 네이티브 클라이언트와 Next.js 웹 클라이언트,
Socket.io 서버로 만든 초대 전용 메신저입니다. 새 개인·그룹 메시지와 첨부 파일은
기기에서 종단간 암호화하며, 서버는 모든 수신 기기의 저장 확인 후 임시 암호문을 삭제합니다.
계정·참여·전달 정보와 운영자 안내 대화는 서버에 보관합니다.
웹사이트는 기존 한국어 번역을 서버 렌더링에도 사용하여 JavaScript가 로드되기 전부터
한국어 콘텐츠, 탐색 메뉴 및 페이지 메타데이터를 표시합니다.
홈페이지는 최대 1,040px의 가운데 정렬 레이아웃으로 개인의 데이터 주권과 대화
소유권을 강조합니다. 일반적인 메신저 기능이나 가족·업무 활용 사례 대신, 기기에서
암호화한 메시지를 서버가 임시 중계하고 모든 수신 기기의 저장 확인 후 삭제하는 구조를
첫 화면의 기기·잠금·서버·수신 확인·삭제 아이콘과 방향 화살표로 설명합니다.
도식은 짧은 레이블 위주이며, 자세한 설명은 스크린 리더에도 제공합니다.
도식의 장식용 제목과 반복 상태 배지는 생략합니다.
웹사이트의 태그라인은 “광고 · 검열 없이 안전하게 소통하세요”로 통일합니다.
사이트 테마는 문서의 head에서 렌더링 전에 적용합니다. 저장된 밝게·어둡게 설정을
우선하고, 설정이 없으면 시스템 테마를 따르므로 시작 시 배경색이 뒤늦게 바뀌지 않습니다.
홈페이지 문구는 짧고 친근한 설명체로 작성하며, 기술 용어보다 사용자에게 익숙한
표현을 우선합니다. 기기 저장 확인과 읽음은 구분합니다.
첫 화면에는 지향하는 미래라는 문구를 함께 표시하고, 검색 메타데이터에서도
적용 범위를 안내합니다. 태그라인은 모든 검열 방지를 보장하는 문구가 아닙니다.
가까이 놓인 두 기기의 저장 아이콘으로 로컬 보관을 강조합니다. 장식 원과 점선 없이
메시지 전송 → 작은 서버의 임시 보관 → 상대 기기 수신과 동시에 수신 확인 문구·
서버 메시지의 모자이크 픽셀 분산·삭제 순서로 8초 애니메이션이 재생됩니다.
서버로 돌아가는 수신 확인 패킷은 시각적으로 표시하지 않습니다.
애니메이션은 체크박스로 일시 정지할 수 있으며 동작 줄이기 설정도 따릅니다.
기기 보관·서버 삭제 안내는 도식 카드 상단에, 자동 재생 체크박스는 카드 밖 아래에 배치합니다.
수신 확인은 읽음 표시와 구분합니다.
대화 기록과 미디어는 기기에 보관합니다. 오프라인 수신 기기가 있으면 암호문은
확인이 올 때까지 서버에 남습니다.
소중한 사람과의 사적인 대화는 당사자 사이에 머물러야 한다는 원칙과, 개인의 데이터
소유·보관을 통해 플랫폼이나 권력 기관의 일방적인 검열·삭제에 대한 의존을 줄이려는
방향을 강조합니다. 검열 불가능한 구조는 아니며, 개인 보관만으로 모든 검열을
막거나 서비스 접근을 보장할 수 없다는 한계도 같은 영역에 표시합니다.
수신자의 재공유, 기기 접근, 법적 정보 요청, 통신 차단까지 막거나 모든 기관의
접근으로부터 안전하다는 보장은 하지 않습니다.
홈페이지의 클로즈드 루프 도식은 새 개인·그룹 메시지에 적용됩니다.
운영 환경의 HTTPS/WSS 전송, 개인 저장소 암호화와 전달 메타데이터 보관 범위는
펼쳐 볼 수 있는 공통 푸터의 데이터 관리 안내에 표시합니다.
홈페이지의 소유권 문구는 간결하고 긍정적으로 유지하며, 사용자 추적 불가를 보장하지 않습니다.
초대가 없는 방문자는 바로 가입할 수 없다는
점과 스토어 출시 전에는 현재 웹 앱을 이용할 수 있다는 점도 안내합니다.
추천·초대 기반 가입은 스팸과 봇의 유입을 줄이고 실제 사람 사이의 대화를 위한
구조로 설명합니다. 초대는 생태계의 기본 재화이며, 향후 Web3 전환에서도 참여와
연결의 기반으로 활용할 계획임을 현재 가입 방식과 구분해 안내합니다.
초대 안내에는 16초 반복 SVG 애니메이션으로 관계망의 성장, 구성원들의 공동 검토·투표,
악성 계정과 스팸의 연결 해제를 보여 줍니다. 분산 거버넌스는 현재 기능이 아닌 미래
개념도로 명시합니다. 자동 재생을 끄면 일시 정지하며, 동작 줄이기 설정에서는 성장한
관계망과 연결 해제 결과를 정적으로 표시합니다.
데스크톱에서는 왼쪽 초대 안내를 상단에, 접이식 초대 도움말을 같은 열의 하단에
배치하고, 오른쪽에 관계망 도식을 표시합니다. 좁은 화면에서는 안내·도움말·도식 순으로 쌓습니다.
메인 웹 앱 시작 버튼 아래에는 App Store와 Google Play의 출시 예정 상태를 비활성 버튼으로 표시합니다.
스토어 버튼에는 로컬 SVG의 Apple·Google Play 브랜드 아이콘을 단색으로 표시합니다.
첫 화면은 소유권과 전달 도식, 본문은 보관 방식과 초대 기반 가입 안내,
마지막은 사람 중심 Web3 로드맵에 집중합니다. 본문의 보관 방식은 카드 대신 번호가 붙은 3단계(암호화·중계·삭제)로
한 번만 설명하며, 반복 요약 띠와 중복 맺음말은 표시하지 않습니다.
로드맵 앞의 내 데이터 영역은 기기 보관 기록을 유형별로 탐색하고 태그로 정리하는
앱 기능을 소개합니다. 블록 그래프는 예시로 표시하며, OneDrive·Google Drive·
Apple iCloud·Dropbox 연동은 연결되지 않은 미리보기이자 향후 계획임을 명시합니다.
현재 클라우드 동기화·백업·업로드는 제공하지 않습니다.
홈페이지와 앱의 클라우드 카드는 각 제공업체의 Material Design 브랜드 아이콘을
그레이스케일로 표시합니다. 아이콘은 로컬에 포함하며 외부 서버에서 불러오지 않습니다.
홈페이지와 앱의 클라우드 안내 아래에는 개인 NAS 저장·동기화 지원 계획도 표시합니다.
NAS는 지원 예정·연결 안 됨 상태이며, 현재 연결·백업·동기화 기능은 제공하지 않습니다.
Web3 로드맵은 현재의 초대 관계망에서, 신뢰가 확인된 사람의 분산 거버넌스와 실제 기여 중심 경제로
이어지는 방향을 설명합니다. 지갑 수·자산 보유량·거래량보다 관계·참여·쓰임을 우선하며,
사람 여부 확인과 다중 계정·AI 에이전트의 의결권·보상 독점 억제는 향후 설계·검증할 목표로 표시합니다.
현재 초대만으로 사람 여부가 인증되거나 봇·에이전트가 차단된다고 주장하지 않습니다.
로드맵은 2026년 4분기부터 2036년 4분기까지 10년의 방향을 연도·분기별 세로 타임라인으로 표시합니다.
2026년의 현재 기반 이후 10개의 미래 이정표는 잠정 목표이며, 보안 검증·실험·구성원 합의에 따라
조정할 수 있고 출시 확약이나 확정 일정이 아님을 타임라인 앞에서 안내합니다.
계정·기록 보관 정보는 별도 본문 제목 없이 모든 페이지의 푸터에 접이식으로 제공합니다.

홈·통계·초대·약관·지원·관리자 페이지는 `SiteHeader`와 `SiteFooter`를 공유합니다.
헤더·본문·푸터는 공통 `site-container` 스타일로 최대 1,040px에 맞추며,
좌우 여백은 기본 24px, 680px 이하 화면에서는 16px로 통일합니다.

### 사용자 전용 암호화 아키텍처

사용자 기기만 개인정보를 복호화하는 구조와 전환 조건은
[암호화 문서](docs/ENCRYPTED_MESSAGING.md#owner-only-identity-architecture)에 정리되어 있습니다.
개인 계정은 이메일+비밀번호 또는 전화번호+비밀번호로 인증하며, 프로필·연락처·초대 이력·설정과
개인 대화 이름은 기기에서 암호화한 개인 저장소로 동기화합니다.
계정 ID는 무작위로 배정하고, 원하는 사람은 공개 사용자명을 예약할 수 있습니다.
계정 ID 또는 사용자명의 정확한 검색으로 연결하며 개인 프로필 이름은 검색하지 않습니다.
로그인용 이메일·전화번호는 서버에서 암호화 보관하고, 비밀번호 자체는 전송하거나 저장하지 않습니다.
소유자 키는 비밀번호 강화 함수로 기기에서 유도합니다. 1단계에는 인증번호나 복구 문구가 필요하지 않습니다.
암호문을 열 수 있는 키는 서버로 보내지 않습니다. 서버에는 공개 키와
임의 계정·참여·전달 식별자 등 운영 메타데이터가 남습니다.
기존 계정 데이터의 전환은 명시적인 소유자 마이그레이션이 필요하며 자동 삭제하지 않습니다.
사용자 추적 불가나 완전한 익명성을 보장하지 않습니다.

### 초대 연결망

통계 옆의 `/invitations` 페이지에서 익명 초대 연결망을 하나의 세대별 트리 지도로 볼 수 있습니다.
가입자가 100명 미만이면 240개의 가상 노드를 사용하고, 안내 문구와 예시 수치를
실제 가입자 수와 구분해 표시합니다. 100명부터 실제 초대 연결을 표시합니다.
Sigma.js 4의 WebGL 2 렌더러, Graphology 방향 그래프와 D3의 방사형 트리 배치를 사용합니다.
세대별 색상, 연결 규모에 따른 점 크기, 곡선 화살표와 선택한 가지·초대 경로 강조를 하나의 스타일로 제공합니다.
확대·축소·이동·점 선택과 키보드용 연결 선택을 지원하며, 동작 줄이기 설정에서는 카메라 애니메이션을 끕니다.
WebGL 2를 사용할 수 없는 경우 오류 안내와 연결 선택 슬라이더·수치를 제공하며 다른 렌더러로 조용히 전환하지 않습니다.
API는 `/api/invitations/map`이며 1분 캐시와 동시 요청 병합을 적용합니다.
실제 지도는 최대 2,000개 노드를 사용하며, 계정 ID와 프로필 대신 섞인 정수 식별자를 표시합니다.

초대는 일회용 코드이며, 서버는 가입과 연결망에 필요한 발급·수락 관계를 기록합니다.
개인의 초대 관리 이력은 암호화된 개인 저장소에 보관합니다.
배포 전에 `npm run prisma:generate --prefix server`와 `npm run db:push --prefix server`로
추가 스키마를 반영하세요. 파괴적 변경 경고가 나오면 중단하고 확인해야 합니다.
기존 스키마와 데이터는 강제로 초기화하지 않습니다.

### 현재 기능

구현된 기능:

- 이메일/전화번호+비밀번호 기반 키 유도 및 Ed25519 증명으로 가입·로그인
- 최초 사용자 등록 및 초대 코드 기반 가입
- 일대일 및 그룹 대화 메타데이터 관리
- 실시간 텍스트, 입력 상태, 반응, 수정 및 삭제 이벤트 중계
- 네이티브 비공개 파일·웹 IndexedDB에 암호화한 계정별 기록과 첨부 파일
- 새 개인·그룹 메시지의 종단간 암호화, 기기별 저장 확인 후 임시 암호문 삭제
- 소유자 전용 암호화 프로필·연락처 그룹·즐겨찾기·설정, 선택적 공개 사용자명 예약과 차단
- 현재 한국어 전용 인터페이스
- 라이트, 다크 및 시스템 테마
- 개인 저장소 내 암호화 프로필 사진 및 인증된 링크 미리보기 조회
- 파일 공유, 오프라인 텍스트 재전송, 읽음 상태 및 푸시 알림
- 일대일 음성/영상 통화, 웹 화면 공유 및 그룹 관리자 역할
- 사용자/메시지 신고, 차단 및 앱 내 계정 삭제

현재 제약 사항:

- 업로드 파일은 로컬 디스크에 저장되므로 운영 환경에는 영구 볼륨이 필요합니다.
- 원격 미디어 백업은 아직 구현되지 않았습니다.
- 스티커, 봇, 네이티브 화면 공유는 아직 구현되지 않았습니다.
- 새 프로토콜에는 전방향 안전성이 없으며, 최초 키 신뢰와 새 기기 확인에는 외부 코드 비교가 필요합니다.

암호화 방식, 배포 순서, 기기 손실과 보안 한계는
[암호화 메시징 문서](docs/ENCRYPTED_MESSAGING.md)를 확인하세요.

### 출시 상태

서버 검사 10개, Prisma 스키마 검증, 웹 운영 빌드, 핵심 릴리스 스모크 테스트 및 운영 의존성
감사는 통과합니다. Expo Doctor는 현재 SDK 패키지 버전 불일치를 보고하므로 모바일 의존성
검사는 해결이 필요합니다. EAS 프로젝트 `@eddiec2025/looptalk`가 연결되어 있고 Android
운영 키스토어도 EAS에 생성되어 있습니다.

남은 작업은 외부 운영 작업입니다. `looptalk.app`에 HTTPS 서버를 배포하고 SQLite
데이터베이스와 업로드를 위한 영구 볼륨, 백업, Coturn, Sentry 및 운영 이메일을
구성해야 합니다. 현재 데이터베이스는 SQLite이므로 단일 서버 인스턴스를 사용해야 합니다.
그 다음 EAS 운영 환경 변수와 iOS 서명 자격 증명을 설정하고 서명된
iOS/Android 빌드를 실제 기기에서 검증한 후 스토어 심사를 제출하세요. 정확한 순서와
완료 조건은 [출시 실행서](docs/LAUNCH_RUNBOOK.md)를 따릅니다.

### 구조

```text
LoopTalk/
|-- app/                Next.js 웹사이트 및 브라우저 경로
|-- mobile/             iOS/Android Expo 애플리케이션
|   |-- App.js
|   `-- src/
|       |-- api/        HTTP 클라이언트
|       |-- screens/    화면
|       |-- storage/    로컬 대화 기록
|       `-- store/      Zustand 상태 및 Socket.io 수명 주기
`-- server/             Next.js 및 Socket.io 서버
    |-- prisma/         SQLite Prisma 스키마 및 마이그레이션
    |-- scripts/        프로젝트 검사 도구
    |-- src/
    |   |-- config/     시작 환경 검증
    |   |-- db/         공유 Prisma 클라이언트
    |   `-- routes/     HTTP API
    `-- test/           Node 테스트
```

서버 데이터베이스에는 암호화된 개인 저장소, 공개 키, 임의 계정 식별자,
초대 코드와 발급·수락 관계, 메시지 암호문과 참여·기기·전달·차단 메타데이터가 저장됩니다.
이전 방식의 기록은 소유자가 명시적으로 전환하기 전까지 기존 상태로 남습니다.

### 로컬 실행

Node.js 22와 npm이 필요합니다. 저장소의 `.nvmrc`, CI 및 Docker는 Node.js 22를 사용합니다.

```sh
npm ci
npm ci --prefix mobile
```

서버 및 모바일 예제 환경 파일을 각각 `.env`로 복사하고 서버에서
`npm run db:setup --prefix server`를 실행하세요. 파일은 Windows에서는
PowerShell `Copy-Item` 또는 파일 탐색기로, macOS/Linux에서는 `cp`로 복사할 수 있습니다.

별도 터미널에서 서버와 Expo 개발 서버를 실행합니다.

```sh
npm run dev --prefix server
npm start --prefix mobile
```

로컬 API 주소는 `http://localhost:3001`입니다. 비어 있는 데이터베이스의
첫 계정은 초대 없이 생성할 수 있으며 이후 계정에는 초대가 필요합니다.
실제 기기에서는 `EXPO_PUBLIC_API_URL`을 개발 컴퓨터의 접근 가능한 LAN
주소로 설정하고 방화벽에서 3001 포트 연결을 허용해야 합니다. Android 에뮬레이터에서는
`http://10.0.2.2:3001`을 사용하세요. iOS 시뮬레이터와 웹 브라우저는
`http://localhost:3001`을 사용할 수 있습니다.

### 검사

변경 사항을 제출하기 전에 두 프로젝트의 검사를 실행하세요.

```sh
npm run check
npm run export:web
npm run build
```

서버 검사는 JavaScript 구문, Prisma 클라이언트 공유 규칙, 단위 테스트 및
Prisma 스키마를 확인합니다. 클라이언트 검사는 Expo Doctor를 실행합니다.

### 문서

- [모바일 앱 안내서](mobile/README.md)
- [서버 및 API 안내서](server/README.md)
- [라이선스](LICENSE)

---

## 日本語

LoopTalkは、Expo React Nativeネイティブクライアント、Next.js Webクライアント、
Socket.ioサーバーで構築された招待制メッセンジャーです。クライアントはアカウントごとの会話履歴を
端末に保存します。新しい個人・グループメッセージはE2EEで中継し、全対象端末の
保存確認後にサーバーの暗号文を削除します。以前の履歴と運営者との会話は残ります。
[プロトコルと制限](docs/ENCRYPTED_MESSAGING.md)を確認してください。

### 現在の機能

実装済み:

- メールアドレスまたは電話番号による登録、初回ユーザー登録、招待制アクセス
- プロバイダー認証情報を設定した場合のGoogleおよびAppleログイン
- ダイレクトおよびグループ会話のメタデータ管理
- テキスト、入力状態、リアクション、編集、削除イベントのリアルタイム中継
- ネイティブ非公開ファイル・Web IndexedDBによる会話履歴と添付ファイル
- 連絡先グループ、お気に入り、プロフィール、ブロック
- 現在は韓国語専用のインターフェース
- ライト、ダーク、システムテーマ
- プロフィール画像のアップロードと認証済みリンクプレビュー取得
- ファイル共有、オフラインテキスト再送、既読状態、プッシュ通知
- 1対1の音声/ビデオ通話、Web画面共有、グループ管理者ロール
- ユーザー/メッセージ報告、ブロック、アプリ内アカウント削除

現在の制約:

- アップロードはローカルディスクに保存されるため、本番環境には永続ボリュームが必要です。
- リモートメディアバックアップ、ステッカー、ボット、ネイティブ画面共有は未実装です。
- 新しい暗号化方式には前方秘匿性がなく、初回の鍵と新端末は別経路でコードの確認が必要です。

### リリース状況

サーバーの10チェック、Prismaスキーマ検証、Web本番ビルド、主要リリーススモークテスト、
本番依存関係監査は成功しています。Expo Doctorは現在SDKパッケージのバージョン不一致を
報告しているため、モバイル依存関係の検査は要対応です。EASプロジェクト`@eddiec2025/looptalk`はリンク済みで、
Android本番キーストアもEASに作成済みです。

残りは外部運用作業です。`looptalk.app`へHTTPSサーバーを配備し、SQLiteデータベースと
アップロード用の永続ボリューム、バックアップ、Coturn、Sentry、本番メールを設定します。
現在のデータベースはSQLiteのため、サーバーは1インスタンスで運用してください。
その後、EAS本番環境変数とiOS署名資格情報を設定し、
署名済みiOS/Androidビルドを実機で検証してからストア審査へ提出してください。
正確な順序と完了条件は[リリースランブック](docs/LAUNCH_RUNBOOK.md)に従います。

### 構成

```text
LoopTalk/
|-- app/                Next.jsサイトおよびブラウザルート
|-- mobile/             iOS/Android Expoアプリケーション
|   |-- App.js
|   `-- src/
|       |-- api/        HTTPクライアント
|       |-- screens/    画面
|       |-- storage/    ローカル会話履歴
|       `-- store/      Zustand状態とSocket.ioライフサイクル
`-- server/             Next.jsおよびSocket.ioサーバー
    |-- prisma/         SQLite Prismaスキーマとマイグレーション
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

Node.js 22とnpmが必要です。`.nvmrc`、CI、DockerはNode.js 22を使用します。

サーバー:

```sh
npm ci
npm ci --prefix mobile
```

サーバーとモバイルの例示環境ファイルをそれぞれ`.env`へコピーし、サーバーで
`npm run db:setup --prefix server`を実行してください。ファイルはWindowsでは
PowerShell `Copy-Item`またはエクスプローラーで、macOS/Linuxでは`cp`でコピーできます。

別々のターミナルでサーバーとExpo開発サーバーを起動します。

```sh
npm run dev --prefix server
npm start --prefix mobile
```

ローカルAPIは`http://localhost:3001`で起動します。空のデータベースでは、
最初のアカウントを招待なしで作成でき、それ以降は招待が必要です。
実機では、`EXPO_PUBLIC_API_URL`を開発用コンピューターへ接続できるLAN
アドレスに設定し、ファイアウォールでポート3001への接続を許可してください。
Androidエミュレーターでは`http://10.0.2.2:3001`、iOSシミュレーターとWebブラウザーでは
`http://localhost:3001`を使用できます。

### 検証

変更を提出する前に、両方のプロジェクト検査を実行してください。

```sh
npm run check
npm run export:web
npm run build
```

サーバー検査では、JavaScript構文、Prismaクライアントの共有規則、
ユニットテスト、Prismaスキーマを確認します。クライアント検査では
Expo Doctorを実行します。

### ドキュメント

- [モバイルアプリガイド](mobile/README.md)
- [サーバーおよびAPIガイド](server/README.md)
- [ライセンス](LICENSE)

---

## English

LoopTalk is an invitation-only messenger built with Expo React Native clients
for iOS and Android, a Next.js browser client, and a Socket.io server. New private
and group messages/attachments are end-to-end encrypted and saved on devices;
the server deletes live ciphertext after every addressed device confirms storage.
Operator conversations are server-readable. See the
[protocol, rollout, and security limits](docs/ENCRYPTED_MESSAGING.md).

### Current Capabilities

Implemented:

- Email or phone registration, first-user bootstrap, and invitation access
- Google and Apple identity verification when provider credentials are set
- Direct and group conversation metadata
- Live text relay, typing indicators, reactions, edits, and deletions
- Per-account native private-file/browser IndexedDB history and attachments
- E2EE private/group deliveries and ciphertext deletion after per-device storage receipts
- Contacts, fixed contact groups, favorites, profiles, and blocking
- Korean-only interface for the current release
- Light, dark, and system theme preferences
- Profile-picture upload and authenticated link-preview lookup
- File sharing, offline text retry, read state, and push notifications
- Direct voice/video calling, browser screen sharing, and group administration
- User/message reports, blocking, and in-app account deletion

Current constraints:

- Uploaded media uses local disk and requires a persistent production volume.
- Remote media backup, stickers, bots, and native screen sharing are not implemented.
- The protocol has no forward secrecy; first-contact keys and newly added devices
  need safety-code comparison over another trusted channel.

### Release Status

The server checks, the Prisma schema, the production web export, the critical
release smoke test, and production dependency audits pass. Expo Doctor currently
reports SDK package-version mismatches, so the mobile dependency gate remains
open. EAS project
`@eddiec2025/looptalk` is linked, and its Android production keystore is stored
in EAS.

The remaining work is external operations: deploy the HTTPS server at
`looptalk.app`; provision durable storage for the SQLite database and uploads,
backups, Coturn, Sentry, and production email; configure
the EAS production environment and iOS signing; then certify signed iOS and
Android builds on physical devices before store submission. Follow the
[launch runbook](docs/LAUNCH_RUNBOOK.md) for the exact order and release gates.
The current database is SQLite, so deploy one server instance.

### Architecture

```text
LoopTalk/
|-- app/                    Next.js website and browser messenger
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
    |-- prisma/            SQLite Prisma schema and migrations
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

Prerequisites: Node.js 22 and npm. The repository `.nvmrc`, CI, and Docker
images use Node.js 22.

Install dependencies from the repository root:

```sh
npm ci
npm ci --prefix mobile
```

Copy `server/.env.example` and `mobile/.env.example` to `.env` in their
respective folders. Use PowerShell `Copy-Item` or File Explorer on Windows,
and `cp` on macOS/Linux. Then set up the server database:

```sh
npm run db:setup --prefix server
```

Start the API and Expo in separate terminals:

```sh
npm run dev --prefix server
npm start --prefix mobile
```

The local API listens on `http://localhost:3001`. The first account can be
created without an invitation; every later account requires one.

Use `npm run android --prefix mobile` or `npm run ios --prefix mobile` for a
native target. The browser client is part of the root Next.js application and
is available at `/app`.
For a physical device, set `EXPO_PUBLIC_API_URL` to a server address reachable
from that device instead of `localhost`.
For an Android emulator, use `http://10.0.2.2:3001`; iOS simulators and web
browsers can use `http://localhost:3001`. Allow port 3001 through the computer's
firewall when connecting from a physical device.

### Validation

Run the repository check before submitting changes:

```sh
npm run check
npm run export:web
npm run build
```

The server check parses all server JavaScript, verifies shared Prisma client
ownership, runs unit tests, and validates the Prisma schema. The client check
runs Expo Doctor.

For a release build, run `npm run release:prepare`. The server synchronizes
the Prisma schema to SQLite when it starts; back up the database and uploaded
files before deploying a schema change.

### Documentation

- [Mobile app guide](mobile/README.md)
- [Server guide and API](server/README.md)
- [Launch runbook](docs/LAUNCH_RUNBOOK.md)
- [Store listing](docs/STORE_LISTING.md)
- [Privacy disclosures](docs/PRIVACY_DISCLOSURES.md)
- [License](LICENSE)

### License

MIT