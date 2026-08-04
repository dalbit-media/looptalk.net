# Store Listing

## Submission Status

**English:** Listing copy is drafted, but submission is blocked until the
production URLs, signed binaries, physical-device certification, screenshots,
review accounts, and store privacy forms are complete.

**한국어:** 스토어 문안은 준비되었지만 운영 URL, 서명된 바이너리, 실제 기기 검증,
스크린샷, 심사 계정 및 스토어 개인정보 양식이 완료되기 전에는 제출할 수 없습니다.

**日本語:** ストア文案は準備済みですが、本番URL、署名済みバイナリ、実機検証、
スクリーンショット、審査アカウント、ストアのプライバシーフォーム完了まで提出できません。

Before submission:

- [ ] Support, privacy, terms, and account-deletion URLs return HTTP 200 publicly
- [ ] Universal/app-link trust files return valid production identifiers
- [ ] Signed iOS and Android production builds pass the physical-device gate
- [ ] Screenshots are captured from signed builds using fictional data
- [ ] A permanent invitation-enabled reviewer account and second test account work
- [ ] Apple privacy labels and Google Play Data Safety match `PRIVACY_DISCLOSURES.md`
- [ ] Calling, notification, camera, microphone, photo, and Bluetooth permissions are declared
- [ ] Review credentials and store signing credentials exist only in private console fields

## Shared Metadata

**App name:** LoopTalk

**Subtitle / short description:** Private conversations, thoughtfully connected

**Promotional text:** Invitation-only messaging with organized contacts, rich sharing, groups, voice calls, and video calls across mobile and web.

**Description:**

LoopTalk is a calmer place for conversations with the people who matter. Join through a trusted invitation, organize contacts around real relationships, and keep direct and group conversations close at hand.

Send text, photos, videos, voice messages, drawings, documents, and links with previews. Reply, react, edit, and follow read activity without losing context. Start voice or video calls directly from a conversation, and continue messaging when a connection briefly drops.

Safety controls are built in. Block unwanted contact, report a user or message, manage device permissions and notifications, and permanently delete your account from Settings.

LoopTalk supports Korean, English, and Japanese, with light and dark appearance on iPhone, iPad, Android, and the web.

Some features require camera, microphone, photo-library, notification, or Bluetooth permissions. Messages are encrypted in transit but are not currently end-to-end encrypted.

**Keywords (iOS, 100 characters maximum):** messenger,chat,groups,voice,video,private,contacts,invite,files,Korean

**Category:** Social Networking (iOS), Communication (Android)

**Support URL:** `https://looptalk.app/support`

**Privacy policy URL:** `https://looptalk.app/privacy`

**Terms URL:** `https://looptalk.app/terms`

**Account deletion URL:** `https://looptalk.app/account-deletion`

## Review Notes

LoopTalk is invitation-only. Provide App Review with a permanent review account and a second test account/contact. Include credentials only in the private store review field, never in this repository.

Suggested reviewer path:

1. Sign in with the supplied review account.
2. Open Messages to inspect the seeded direct and group conversations.
3. Open a conversation to send media or start voice/video calls.
4. Long-press another user's message to access Report message.
5. Open that user's profile for Block and Report user.
6. Open Settings for Privacy, Terms, Support, and Delete account.

Voice/video calls require two signed-in physical devices. Browser screen sharing is web-only; native screen sharing is not advertised.

Do not promise end-to-end encryption or guaranteed incoming ringing after iOS
termination. Terminated-state behavior must be proven on the signed build; add
PushKit before release if ordinary remote notifications are not reliable.

## Screenshot Set

Capture on current required iPhone/iPad and Android phone/tablet sizes:

1. Messages list with direct and group conversations
2. Rich chat with photo, link preview, reaction, reply, and read state
3. Organized contacts and public search
4. Connected video call
5. Group information with roles and members
6. Settings showing privacy, support, and account controls

Use production-like fictional data. Do not expose real phone numbers, email addresses, tokens, or private conversations.
