# Store Privacy Disclosures

Use this inventory when completing Apple App Privacy and Google Play Data Safety forms. Confirm it against the selected production providers before submission.

**Status / 상태 / 状況:** This inventory is drafted, but production providers,
regions, contracts, retention periods, backup deletion behavior, and final store
answers are not yet confirmed. / 이 목록은 초안이며 운영 공급자, 지역, 계약, 보존 기간,
백업 삭제 방식 및 최종 스토어 답변을 확인해야 합니다. / この一覧は草案であり、本番
プロバイダー、地域、契約、保持期間、バックアップ削除、最終ストア回答の確認が必要です。

| Data | Purpose | Linked to user | Required | Notes |
| --- | --- | --- | --- | --- |
| Email address / phone number | Account management, authentication | Yes | One contact method | User supplied |
| User ID, username, display name, profile | App functionality | Yes | Yes | Public to relevant users |
| Contacts created in LoopTalk | App functionality | Yes | No | The app does not upload the device address book |
| Messages, reactions, files, photos, videos, voice | App functionality, safety | Yes | No | Encrypted in transit; not E2EE |
| Push token and platform | Notifications | Yes | No | Disabled when notifications are turned off |
| Call signaling and diagnostics | App functionality | Yes | No | Audio/video media uses WebRTC |
| Abuse reports and content snapshot | Safety, compliance | Yes | No | May outlive account deletion where necessary |
| Crash diagnostics | Analytics / app functionality | Normally pseudonymous | No | Sentry; default PII collection disabled |
| IP address and request/security logs | Security, fraud prevention | Potentially | Automatic | Define provider retention before submission |

## Form Answers to Verify

- Data is not sold.
- Data is not used for third-party advertising or cross-company tracking.
- Account deletion is available in Settings and at `https://looptalk.app/account-deletion`.
- Transport encryption is required in production.
- Users can block and report user-generated content.
- The app does not currently provide end-to-end encryption.
- The app does not request device address-book access or location access.
- Social-login providers receive the data needed for authentication under their own terms.

## Production Provider Register

Before submission, record legal names, regions, contracts, subprocessors, and retention for:

- Hosting/container provider
- MySQL and backup provider
- Persistent media storage provider
- Redis provider, if used
- Coturn provider
- Expo push/EAS
- Apple and Google authentication
- Sentry

Update the public Privacy Policy if the actual deployment differs from its disclosures.

## Completion Gate

- [ ] Record each provider's legal entity, processing region, subprocessors, and contract/DPA
- [ ] Document retention for messages, media, logs, reports, push tokens, and call diagnostics
- [ ] Document account-deletion timing for primary data, media, backups, and legally retained reports
- [ ] Verify encryption in transit, backup encryption, access controls, and restore procedures
- [ ] Confirm whether any provider processes data outside the user's region
- [ ] Reconcile Apple App Privacy and Google Play Data Safety answers with the deployed system
- [ ] Update the public policy and its effective date, then verify its public URL returns HTTP 200
- [ ] Obtain final privacy/legal approval before submitting either store form
