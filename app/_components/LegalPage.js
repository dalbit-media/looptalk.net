const PrivacyContent = () => (
  <>
    <p>Effective August 1, 2026</p>
    <h2>Information we collect</h2>
    <p>Private accounts sign in with an email address or phone number and a password. Contact identifiers are encrypted at rest for account lookup; the service holds the contact-storage key. Passwords are not sent or stored: your device derives authentication and encryption keys using a password-strengthening function and a random account salt. Display names and usernames are public and readable by the server, appearing in profiles, exact ID/username search, contacts and conversations. Updated clients publish an existing account&apos;s saved display name when opening its session. Bios, photos, contacts, personal nicknames, conversation labels, invitation history, and preferences are encrypted before they are synced as a private vault. Account IDs are randomly assigned. We still process public verification keys, opaque account and conversation identifiers, delivery membership, push tokens, call signaling, and technical records needed to operate the service.</p>
    <h2>How we use information</h2>
    <p>We use information to authenticate accounts, deliver conversations and calls, send notifications, display link previews, prevent abuse, respond to support requests, maintain service reliability, and comply with law. We do not sell personal information or use message content for advertising.</p>
    <p>The public invitation map shows actual invitation relationships and the last four characters of user IDs, using shuffled temporary node identifiers rather than full account IDs or private profiles. It also displays recent incoming/outgoing encrypted-payload size estimates and timing. These public activity signals can permit correlation; message contents and recipient pairs are not shown. Chart samples are held in bounded server-worker memory for up to 10 seconds, not saved as chart history. The server records invitation issuer/redemption relationships; personal invitation-management history remains in the encrypted owner vault.</p>
    <h2>Message privacy</h2>
    <p>Private and group messages, attachments, edits, deletions, and reactions are end-to-end encrypted on participating devices. The server holds ciphertext until every device addressed at send time confirms local storage, then removes the live queued payload. Offline devices can keep ciphertext queued indefinitely. The server retains public verification and device keys, opaque account identifiers, conversation membership, and delivery metadata. Encryption of personal information does not hide all routing relationships, IP addresses, or traffic timing. Production transport uses HTTPS and secure WebSocket connections.</p>
    <p>Device keys use first-observed-key trust. Compare device safety codes through another trusted channel: unverified first-contact keys and newly registered devices are not protected against a malicious directory. This protocol does not provide forward secrecy or independent security certification. Device or website compromise, recipient sharing, legal requests for retained information, and network blocking are outside its protection.</p>
    <h2>Sharing and processors</h2>
    <p>Information may be processed by infrastructure, database, storage, notification, authentication, and monitoring providers acting on our behalf. We may disclose information when required by law, to protect users, or during a business transfer subject to appropriate safeguards.</p>
    <h2>Retention and deletion</h2>
    <p>Private-account history, attachments, and browser device identities are encrypted locally. To keep you signed in across restarts, the derived account key and session persist in browser local storage; native derived material uses operating-system secure storage. Your password is not saved. Anyone with access to the browser profile or compromised same-origin code may use its saved key to open the account. Sign out on shared devices. Sign-in lasts until logout, local data removal, account deletion, or an application reset; temporary network failures do not erase saved credentials. Native audio/video playback and explicit sharing can create temporary decrypted files, which are removed on account lock; a crash or operating-system copy can leave temporary data. Private-account archive exports are encrypted. Signing in restores the private vault, not history already flushed from the relay or another device&apos;s message keys. Phase one does not provide email/SMS password reset or a recovery phrase. Forgotten credentials can prevent vault recovery. Android app backup is disabled. Removing live records does not guarantee forensic erasure from journals, logs, or infrastructure backups. Reports intentionally disclose the chosen category and opaque account/message identifiers to the operator, without automatically including decrypted messages or profiles.</p>
    <h2>Your choices</h2>
    <p>You can update profile information, control notifications and device permissions, block users, report content, and delete your account in the app. Requests concerning access, correction, or privacy can be sent to <a href="mailto:privacy@looptalk.app">privacy@looptalk.app</a>.</p>
    <h2>Children and changes</h2>
    <p>LoopTalk is not directed to children under 13, or the higher minimum age required in their country. We may update this policy and will publish the effective date here. Material changes will be communicated through the service where appropriate.</p>
  </>
);

const TermsContent = () => (
  <>
    <p>Effective August 1, 2026</p>
    <h2>Using LoopTalk</h2><p>You must protect your password, comply with the invitation requirements, and be legally able to accept these terms. Choose a strong password; phase one does not provide a password-reset service. You are responsible for activity performed through your account.</p>
    <h2>Acceptable use</h2><p>Do not use LoopTalk for harassment, threats, hate, sexual exploitation, violence, fraud, spam, impersonation, malware, unlawful content, intellectual-property infringement, or attempts to disrupt or bypass service security. You may report users or messages from within the app.</p>
    <h2>Your content</h2><p>You retain ownership of content you submit. You grant LoopTalk the limited rights needed to host, transmit, process, display, back up, and moderate that content solely to operate, secure, and improve the service.</p>
    <h2>Safety and enforcement</h2><p>We may investigate reports, restrict content, suspend accounts, preserve evidence, or contact authorities when reasonably necessary for safety, legal compliance, or enforcement. We aim to apply these measures proportionately.</p>
    <h2>Service availability</h2><p>The service is provided on an as-available basis. Features may change, and uninterrupted delivery cannot be guaranteed. To the extent permitted by law, LoopTalk is not liable for indirect, incidental, special, or consequential damages.</p>
    <h2>Ending service</h2><p>You may stop using LoopTalk or delete your account at any time. We may suspend or terminate access for material violations, security threats, or legal requirements. Provisions that by nature should survive termination will remain effective.</p>
    <h2>Contact</h2><p>Questions about these terms can be sent to <a href="mailto:legal@looptalk.app">legal@looptalk.app</a>.</p>
  </>
);

const SupportContent = () => (
  <>
    <p>For account, messaging, call, notification, accessibility, or billing questions, email <a href="mailto:support@looptalk.app">support@looptalk.app</a>. Include your account identifier, platform, app version, and a description of the problem. Never send your password, private keys, or authentication token. Email support is a separate voluntary disclosure and is not part of the encrypted vault.</p>
    <h2>Safety reports</h2><p>Use Report user on a profile or Report message from a message&apos;s action menu. Use Block to stop new direct communication. If someone is in immediate danger, contact local emergency services before contacting LoopTalk.</p>
    <h2>Privacy requests</h2><p>For access, correction, or deletion, use the authenticated controls in the app. General privacy questions can be sent to <a href="mailto:privacy@looptalk.app">privacy@looptalk.app</a>. An email alone does not prove account ownership or unlock your encrypted vault.</p>
    <h2>Response times</h2><p>We prioritize urgent safety and account-security issues. Standard support requests are normally acknowledged within two business days.</p>
  </>
);

const AccountDeletionContent = () => (
  <>
    <h2>Delete in the app</h2>
    <ol><li>Sign in to LoopTalk.</li><li>Open Settings.</li><li>Select Delete account.</li><li>Review both confirmation prompts and select Delete permanently.</li></ol>
    <p>Deletion removes your account and encrypted vault, device tokens, and the applicable direct-conversation records. Anonymous invitation credentials expire independently because they are not linked to their issuer. Group ownership is transferred before deletion so remaining members can continue their group.</p>
    <h2>When you cannot access the app</h2><p>Sign in with your email or phone number and password, then delete the account in Settings. For assistance, contact <a href="mailto:privacy@looptalk.app?subject=LoopTalk%20account%20deletion">privacy@looptalk.app</a> without sending your password. Support cannot bypass cryptographic ownership checks or decrypt your vault.</p>
    <h2>Data that may remain</h2><p>Other participants&apos; local conversation copies are not remotely erased by account deletion. Shared-group delivery receipts and other recipients&apos; queued deliveries may remain. Abuse reports, security logs, backups, and records required by law may also be retained for the minimum necessary period. These records are access restricted and are not used to operate a deleted account.</p>
  </>
);

const contentByPage = {
  privacy: PrivacyContent,
  terms: TermsContent,
  support: SupportContent,
  "account-deletion": AccountDeletionContent,
};

export default function LegalPage({ page, title, description }) {
  const Content = contentByPage[page];
  return (
    <main className="legal-main site-container" id="main-content">
      <header><p className="eyebrow">LoopTalk</p><h1>{title}</h1><p>{description}</p></header>
      <article><Content /></article>
    </main>
  );
}
