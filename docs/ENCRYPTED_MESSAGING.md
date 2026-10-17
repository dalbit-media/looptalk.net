# Encrypted private messaging

## Owner-only identity architecture

### Implemented private-account boundary

Phase-one registration and login use **email + password or phone + password**.
Email is trimmed/lowercased; phone formatting whitespace, parentheses, periods,
and hyphens are removed. Passwords are exact and are never trimmed or lowercased.
The client derives a secret using PBKDF2-HMAC-SHA256 with 600,000 iterations,
a random per-account 16-byte salt, and the normalized identifier as domain-bound
context. Authentication and encryption keys use separate SHA-512
domain-separated derivations from that secret; messages retain separate
per-device keys. The derived secret is internal, not a user-facing recovery
phrase, and is never uploaded. Login proves possession using a single-use
Ed25519 challenge instead of sending a reusable password.

The public account ID is randomly generated and is independent of the
credential-derived authentication alias. Users can optionally reserve a public
username. Exact lookup by account ID or username is supported; private profile
names are not a searchable directory. A reserved username is intentionally
public, not part of the encrypted profile.

Contact identifiers required for credential lookup are encrypted at rest using
AES-256-GCM under `USER_DATA_ENCRYPTION_KEY`. Lookup uses a domain-separated
keyed HMAC index, never readable email/phone database columns. The service holds
this contact-storage key and can therefore decrypt contact identifiers; do not
claim that the operator is cryptographically unable to access them. The same
key cannot decrypt owner vaults. Configure it once using
`npm run privacy:key --prefix server`, protect/back it up separately, and do not
rotate it without migrating encrypted identifiers and lookup indexes.

Vaults and local records use NaCl XSalsa20-Poly1305 authenticated encryption
with fresh 24-byte random nonces and authenticated account/context binding.
Vault revisions are authenticated inside the ciphertext.

The owner-only vault contains profile names/photos/bio, personal contact labels
and groups, invitation history, preferences, and personal group-conversation
labels. Sync sends only its encrypted envelope and compare-and-swap revision.
The client reports concurrent-device conflicts and reloads authenticated data;
it does not silently overwrite another device's changes.

Private-account local conversation records, outboxes, device identities, trust
pins, deduplication records, attachments, and archive exports are encrypted.
Web derived keys and bearer sessions persist in this browser's local storage;
native derived material and sessions use OS secure storage. No password is saved.
This trusted-device sign-in survives reloads and restarts until logout, local
data removal, account deletion, or an application reset. Anyone who can access
the browser profile, including malicious same-origin code or extensions, may
access the saved key and decrypt local data; local ciphertext is not protected
from that browser profile's compromise. Use logout on shared devices.
Startup proves possession of the saved key with a fresh challenge, so expiration
of a 30-day bearer token does not require password entry. Active sessions renew
daily, checked hourly and on foreground/reconnect. Renewal does not replace the
open vault or discard messages. Transient initialization failures preserve saved
credentials behind an explicit retry screen; authentication rejection clears
the session. Existing server-side token validation and account deletion remain
effective; bearer tokens are not made permanent.
Image previews use data/blob URLs; native audio/video playback and explicit
sharing may require temporary decrypted cache files. Lock clears playback
caches and memory; crashes or OS copies can leave temporary files.

Private signup sends the contact identifier over HTTPS for encrypted credential
lookup storage, but never sends the password, owner decryption key, or readable
profile. Invited signup atomically creates a normal two-person `CHAT` with the
inviter and one fixed, server-readable text attributed to that inviter, marked
`automaticWelcome` and visibly labeled as an automatic, server-readable notice.
This is the sole automatic onboarding exception: replies and subsequent messages
use the normal E2EE relay, and private plaintext-write endpoints remain blocked.
The inviter's contact is imported first into the invitee's encrypted owner vault
before the session opens. An encrypted completion marker makes login recovery
idempotent and preserves later contact removal. Bootstrap signup and invitations
with no surviving inviter create neither a welcome nor a contact.
Peers see public
handles rather than the owner's private profile. Personal group names are local labels, not shared
server-readable names. The server records invitation issuer/redemption
relationships for admission and the public map; personal invitation-management
history remains encrypted. Below 100 users the map shows a labeled fictional
demonstration. At 100 users it shows actual topology, capped at 2,000 nodes with
shuffled integer IDs rather than account IDs or private profiles.

Public keys, opaque identifiers, delivery membership, blocks, device/push
routing, and anti-replay receipts remain operational metadata. Requests and
timing can be correlated. This is **not universal untraceability**, and not every
relationship is hidden from the relay. Existing legacy records require explicit
owner migration and are not silently purged or retroactively claimed encrypted.

### Phase-one recovery and compatibility

Phase one does not require OTP or a recovery phrase. Entering the same
normalized email/phone and exact password restores the encrypted owner vault.
It does not restore messages already flushed from the relay, another device's
message keys, or locally retained history that has not been backed up.

Password reset through email/SMS is not implemented. Adding it requires an
authenticated vault-key rewrapping/recovery design rather than an endpoint that
only replaces the login credential.

Existing password accounts use an explicit, authenticated migration flow.
Migration encrypts owner data before replacing the readable active records,
preserves the original routing ID, and does not reset the database. It does not
claim to erase historical backups, logs, uploads, or SQLite free pages.
Social-provider-only account recovery is not available in this phase.

Reserved usernames and account-ID discovery remain public product features.
Invitation creation is an explicit sharing exception: updated clients send a
snapshot of the owner's display name, after a visible disclosure, for storage
with that invitation. Anyone holding the link can read `Display name (username)`
on the landing page and public invitation-info endpoint. Other profile fields
remain encrypted; old links without a snapshot never expose a legacy private
display name. The public invitation map does not include shared names.
Encrypting private profiles does not remove operational invitation or delivery
metadata or imply an anonymous-credential or unlinkable-routing protocol.

## Message protocol scope and rollout

`CHAT` messages, attachments, edits, deletions, and reactions use the encrypted
relay. Existing legacy `WELCOME` operator conversations are a server-readable
exception, not created by private signup. Private profiles, contact organization,
settings, and invitation history use the encrypted owner vault. Opaque account
identifiers, membership, public keys, push routing, call signaling, and delivery
receipts still use server storage.
There is no silent plaintext fallback: old clients receive `426 E2EE_REQUIRED`
before a private plaintext upload is written.

Back up the production database and uploads, then run the repository's additive
schema deployment (`npm run db:push --prefix server`; stop if Prisma reports any
destructive change) and
`npm run prisma:generate --prefix server`. Export the updated browser app with
`npm run export:web`; build the website and restart the server. Release rebuilt
native clients with the new crypto, filesystem, and sharing modules. Every
participant must sign in using an updated client to register a device before new
private messages can be delivered.

## Encryption and device trust

Each account/device has a NaCl X25519 box key pair. Native private keys use Expo
SecureStore; browser identities use IndexedDB. Public keys are registered under
immutable device IDs. A fresh random 32-byte secretbox key encrypts each JSON
delivery with XSalsa20-Poly1305 and a fresh 24-byte nonce. The server receives
`nonce || ciphertext`, plus a separate NaCl-box-wrapped content key for every
registered participant device except the sending device. Files and thumbnails
are inside the encrypted JSON, not public uploads. Push/socket hints carry no
message content, filenames, attachment URLs, or ciphertext.

The encrypted payload authenticates protocol version, dispatch ID, logical
message ID, operation kind, conversation ID, sender ID, and sender device ID.
Recipients reject authentication or routing mismatches without acknowledging.
Content keys are cleared after use where the JavaScript runtime permits.

This is **not a ratcheting protocol and has no forward secrecy**. First-observed
device keys are pinned locally, and changed known keys stop delivery. This TOFU
mechanism cannot detect first-contact substitution or an inserted new device
without external verification. Tap the encryption notice in a conversation to
compare SHA-512-derived 256-bit public-key fingerprints over another trusted
channel. There is no claim of an independent cryptographic audit, universal
censorship resistance, protection from a compromised device/website, or immunity
to recipient redistribution, legal requests, or network blocking.

## Persistence, receipts, and retries

Before upload, the sending client saves a stable encrypted dispatch and its local
message/operation. Retrying an accepted dispatch reuses identical ciphertext.
Only `409 RECIPIENTS_CHANGED`, which guarantees no previous acceptance, permits
one immediate roster refresh and re-encryption. Other ID conflicts never do.

The server validates the exact current device roster, membership, ownership, and
direct blocks. It stores one binary payload and per-device key envelopes. A
recipient authenticates/decrypts, saves attachments and message/operation, and
commits a deduplication marker **before** ACK. A local write, quota, authentication,
or account-switch failure leaves the queue unacknowledged. Duplicate ACK retries
do not reapply committed content. Browser record updates and identity creation
use atomic IndexedDB read/write transactions with strict durability; native
history uses private document files with temporary-file replacement.

Each ACK removes that device's envelope. The last addressed device's ACK removes
the live ciphertext transactionally. This includes the sender's other registered
devices. Offline/unavailable devices can leave ciphertext queued indefinitely;
there is no TTL or guaranteed maximum retention interval. No new-device history
fan-out occurs after dispatch. Blocking/removal/account deletion can discard
unavailable deliveries rather than delivering to unauthorized users.

Content-free routing/fingerprint receipts remain to authorize operations and
prevent accepted retries from recreating flushed messages. Removing database
rows is **logical deletion**, not guaranteed physical erasure from SQLite
WAL/free pages, snapshots, provider logs, or backups. Configure and verify
infrastructure retention separately.

## Local history and recovery

New history and media use native private files or browser IndexedDB, with
read-compatible fallback for existing AsyncStorage history. A storage failure is
reported rather than treated as an empty history. Native media stays in the
application document directory; web media uses local Blobs/object URLs.
Private file downloads use the platform share sheet or a browser download.
Deleting an encrypted attachment removes the local media on devices that process
that deletion; it cannot revoke copies or exports recipients already made.

Logging out preserves encrypted account-scoped history and device identity for
later recovery-key login while clearing unlocked owner state.
Clearing application/site data, reinstalling, browser storage eviction, or losing
a device can permanently lose keys and history. A replacement device cannot fetch
flushed history. Private-account archive exports wrap the version 2 message/media
archive in a version 1 authenticated encrypted envelope. Legacy archive exports
remain readable; neither format provides automatic history restore. Protect
recovery keys and legacy exports. Android app backup is disabled; iOS and
user-managed operating-system backups may still contain local files.

Do not mark Apple export compliance as transport-only: the app now implements
cryptography outside OS transport APIs. Its previous exemption declaration was
removed; confirm legal/export requirements in App Store Connect before release.
Native device/OS validation and external security review remain release work.

## API and validation

All routes use existing bearer authentication under `/api/secure`:

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/devices` | Register immutable device public key |
| GET | `/conversations/:id/devices` | Current participant device roster |
| POST | `/conversations/:id/messages` | Multipart `metadata` + binary `payload` |
| GET | `/inbox?deviceId=…` | Up to 50 pending envelope descriptors |
| GET | `/messages/:id/payload?deviceId=…` | Authorized binary download |
| POST | `/messages/:id/ack` | Acknowledge committed local storage |

The encrypted upload limit is 140 MiB. Each attachment is limited to 100 MiB,
including base64 expansion in the overall encrypted payload; oversized combined
attachments/thumbnails are rejected before upload.

```sh
node --test mobile/test/secure-messaging.test.cjs server/test/secure-relay.test.js
```

The server test creates and removes its own isolated SQLite database and generated
client, not the development database. Tests cover multi-device ACK deletion,
idempotent retries after flush/roster changes, authorization, plaintext guards,
tampering, key changes, local storage failures, and retry ordering.
