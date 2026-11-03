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

- [x] Support, privacy, terms, and account-deletion URLs return HTTP 200 publicly
- [ ] Universal/app-link trust files return valid production identifiers (currently 404:
      set `APPLE_TEAM_ID` and `ANDROID_CERT_SHA256` on the server)
- [ ] Signed iOS and Android production builds pass the physical-device gate
- [ ] Screenshots are captured from signed builds using fictional data
- [ ] A permanent invitation-enabled reviewer account and second test account work
- [ ] Apple privacy labels and Google Play Data Safety match `PRIVACY_DISCLOSURES.md`
- [ ] Calling, notification, camera, microphone, photo, and Bluetooth permissions are declared
- [ ] Review credentials and store signing credentials exist only in private console fields
- [ ] Export compliance answered in App Store Connect: the app uses standard encryption
      (`ITSAppUsesNonExemptEncryption` is `true` in `mobile/app.json`); confirm the
      exemption category with counsel and add `ITSEncryptionExportComplianceCode` if Apple issues one
- [ ] Google sign-in client IDs (`EXPO_PUBLIC_GOOGLE_*_CLIENT_ID`) are set for both the
      server and EAS, or Google sign-in stays hidden; Sign in with Apple works by default
      with the bundle ID (Guideline 4.8)
- [ ] Sign-up and invitation acceptance show Terms/Privacy consent, and the Terms state
      zero tolerance for objectionable content (Guideline 1.2)
- [ ] `UIBackgroundModes: audio` is justified by in-call audio; be ready to show a call
      continuing in the background, or remove the mode

## Shared Metadata

**App name:** LoopTalk

**Subtitle / short description:** Private conversations, thoughtfully connected

**Promotional text:** Invitation-only messaging with organized contacts, rich sharing, groups, voice calls, and video calls across mobile and web.

**Description:**

LoopTalk is a calmer place for conversations with the people who matter. Join through a trusted invitation, organize contacts around real relationships, and keep direct and group conversations close at hand.

Send text, photos, videos, voice messages, drawings, documents, and links with previews. Reply, react, edit, and follow read activity without losing context. Start voice or video calls directly from a conversation, and continue messaging when a connection briefly drops.

Safety controls are built in. Block unwanted contact, report a user or message, manage device permissions and notifications, and permanently delete your account from Settings.

LoopTalk supports Korean, English, and Japanese, with light and dark appearance on iPhone, iPad, Android, and the web.

Some features require camera, microphone, photo-library, notification, or Bluetooth permissions. Direct and group messages are end-to-end encrypted on your devices; the optional first message attached to an invitation is readable by the server until the invitation is accepted.

**Keywords (iOS, 100 characters maximum):** messenger,chat,groups,voice,video,private,contacts,invite,files,Korean

**Category:** Social Networking (iOS), Communication (Android)

**Support URL:** `https://looptalk.net/support`

**Privacy policy URL:** `https://looptalk.net/privacy`

**Terms URL:** `https://looptalk.net/terms`

**Account deletion URL:** `https://looptalk.net/account-deletion`

## Review Notes

LoopTalk is invitation-only. Provide App Review with a permanent review account, a second test account/contact, and a fresh unexpired invitation link from that contact. Include credentials and links only in the private store review field, never in this repository.

Suggested reviewer path:

1. Open the invitation link and tap Accept. The app creates an account with a
   temporary username/password and opens the chat with the inviter's first message.
   Reply, then open Settings > Account setup to choose a username/password or link
   Sign in with Apple. Alternatively, sign in with the supplied review account.
2. Open Messages to inspect the seeded direct and group conversations.
3. Open a conversation to send media or start voice/video calls.
4. Long-press another user's message to access Report message.
5. Open that user's profile for Block and Report user.
6. Open Settings for Privacy, Terms, Support, and Delete account.

Voice/video calls require two signed-in physical devices. Browser screen sharing is web-only; native screen sharing is not advertised.

Do not promise end-to-end encryption of invitation first messages, or guaranteed
incoming ringing after iOS termination. Terminated-state behavior must be proven on the signed build; add
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
