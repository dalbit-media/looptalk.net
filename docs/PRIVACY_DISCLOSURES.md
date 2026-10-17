# Store Privacy Disclosures

Use this inventory when completing Apple App Privacy and Google Play Data Safety forms. Confirm it against the selected production providers before submission.

**Status / 상태 / 状況:** This inventory is drafted, but production providers,
regions, contracts, retention periods, backup deletion behavior, and final store
answers are not yet confirmed. / 이 목록은 초안이며 운영 공급자, 지역, 계약, 보존 기간,
백업 삭제 방식 및 최종 스토어 답변을 확인해야 합니다. / この一覧は草案であり、本番
プロバイダー、地域、契約、保持期間、バックアップ削除、最終ストア回答の確認が必要です。

| Data | Purpose | Linked to user | Required | Notes |
| --- | --- | --- | --- | --- |
| Email or phone credential identifier | Account lookup | Encrypted and indexed by keyed HMAC | One required | AES-256-GCM at rest under server configuration key; identifier is sent over HTTPS and can be decrypted by the service. Password is never sent or stored. |
| Account public key and random identifier | Proof-of-possession authentication | Pseudonymous | Yes | Password-derived Ed25519 proof; PBKDF2-HMAC-SHA256 600,000 iterations and random account salt; no OTP/recovery phrase in phase one |
| Public username | Optional discoverability | Yes, intentionally public | No | Exact random account ID or reserved username lookup; no private profile name search |
| Profile, contact labels/groups, preferences | App functionality | Ciphertext linked to opaque account | No | Owner vault encrypted before sync; peers receive public handles, not owner profile |
| Contacts created in LoopTalk | App functionality | Owner-encrypted vault | No | No device address book upload; personal contact organization is not stored as readable server Contact records |
| Invitation codes, issuer/redemption relationships, shared display-name snapshots, and encrypted owner history | Referral access and invitation-chain map | Operational relationships and explicitly shared invitation display names are server-readable; personal management history is owner-encrypted | Required for invited signup; updated clients disclose name sharing before link creation | Anyone holding an invitation link can see the shared name and public username. Older links without a snapshot expose only the public username. The public map always shows real topology with shuffled integer node IDs and the last four characters of user IDs, including small networks. Full account IDs and private profiles are omitted; suffixes and topology can still permit correlation and do not guarantee unlinkability. |
| New private/group messages, reactions, files, photos, videos, voice | App functionality | Yes (routing) | No | E2EE; live ciphertext deleted after every addressed device confirms local storage; offline devices can retain the queue indefinitely |
| Legacy operator WELCOME conversations | Existing-account compatibility | Yes | No | Existing server-readable records are not silently purged or claimed encrypted; private signup does not create these conversations |
| Device public keys, membership, delivery receipts | Routing, authentication, idempotency | Yes | Yes for private messages | Retained independently of ciphertext; private keys stay on devices |
| Push token and platform | Notifications | Yes | No | Disabled when notifications are turned off |
| Live online/offline status | Availability indicators | Opaque account ID | Automatic while connected | Broadcast to authenticated clients; private accounts do not save or publish last-seen timestamps. Any foreground device keeps the account online. |
| Live encrypted-payload transfer sizes | Public network visualization | Temporary map node IDs and four-character user-ID suffixes | Automatic during relay transfers | Public incoming/outgoing byte estimates and timing reveal activity, not contents or recipient pairs. Per-worker memory retains up to 10 seconds / 2000 samples; no transfer history is persisted for the chart. |
| Call signaling and diagnostics | App functionality | Yes | No | Audio/video media uses WebRTC |
| Explicit abuse reports | Safety, compliance | Opaque account/message IDs | No | User confirms disclosure of reason and identifiers; no automatic decrypted message/profile snapshot; may outlive account deletion where necessary |
| Crash diagnostics | Analytics / app functionality | Normally pseudonymous | No | Sentry; default PII collection disabled |
| IP address and request/security logs | Security, fraud prevention | Potentially | Automatic | Define provider retention before submission |

## Form Answers to Verify

- Data is not sold.
- Data is not used for third-party advertising or cross-company tracking.
- Account deletion is available in Settings and at `https://looptalk.app/account-deletion`.
- Transport encryption is required in production.
- Users can block and report user-generated content.
- Private/group deliveries use E2EE, including attachments and operations. Invited signup creates one fixed, clearly labeled automatic welcome attributed to the inviter in a normal direct chat. Only this onboarding notice is server-readable; replies use E2EE. The inviter becomes the first contact in the invitee's encrypted vault, not a plaintext Contact row. Bootstrap/anonymous invitations create no welcome. Legacy records retain their actual existing status. See [protocol and limits](ENCRYPTED_MESSAGING.md).
- Receipt-triggered deletion removes live queued ciphertext, not necessarily SQLite journals or backups.
- Private-account local records/media and archive exports are encrypted. Native playback/sharing may create temporary decrypted media in cache while unlocked; lock cleans it, but crashes/OS copies need separate review. New devices do not recover flushed messages. Credential login restores the encrypted owner vault, not another device's local history. No email/SMS password reset is implemented in phase one.
- Device keys use TOFU with optional out-of-band safety-code comparison; the protocol has no forward secrecy.
- Trusted-device sign-in persists the derived account key and bearer session in browser local storage (OS secure storage on native). Passwords are not saved. Reloads/restarts renew authentication using a fresh signed challenge; logout, local data removal, account deletion, or application reset end sign-in. Anyone with access to the browser profile or compromised same-origin code can use its saved key. Temporary connectivity failures do not erase credentials.
- Reassess Apple encryption-export declarations before signing: the former transport-only exemption declaration has been removed.
- The app does not request device address-book access or location access.
- New private accounts do not use social login. Any explicitly supported legacy migration must document its provider processing separately; do not silently recreate identity linkage.

## Production Provider Register

Before submission, record legal names, regions, contracts, subprocessors, and retention for:

- Hosting/container provider
- SQLite database hosting and backup provider
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
