const PrivacyContent = () => (
  <>
    <p>Effective August 1, 2026</p>
    <h2>Information we collect</h2>
    <p>LoopTalk collects account identifiers you provide, such as your email address or phone number, display name, username, profile information, and authentication provider identifiers. We process contacts you add, invitations, blocks, reports, device push tokens, messages, reactions, call signaling, uploaded media, and technical records needed to operate and secure the service.</p>
    <h2>How we use information</h2>
    <p>We use information to authenticate accounts, deliver conversations and calls, send notifications, display link previews, prevent abuse, respond to support requests, maintain service reliability, and comply with law. We do not sell personal information or use message content for advertising.</p>
    <h2>Message privacy</h2>
    <p>Messages are encrypted in transit using HTTPS and secure WebSocket transport in production. LoopTalk does not currently provide end-to-end encryption, so the service processes message content to deliver messaging features, previews, abuse reports, and synchronized history.</p>
    <h2>Sharing and processors</h2>
    <p>Information may be processed by infrastructure, database, storage, notification, authentication, and monitoring providers acting on our behalf. We may disclose information when required by law, to protect users, or during a business transfer subject to appropriate safeguards.</p>
    <h2>Retention and deletion</h2>
    <p>We retain account and communication data while your account is active and as needed for service operation, safety, dispute resolution, and legal obligations. You can permanently delete your account from Settings. Abuse reports may retain a limited snapshot after account deletion where necessary for safety and compliance.</p>
    <h2>Your choices</h2>
    <p>You can update profile information, control notifications and device permissions, block users, report content, and delete your account in the app. Requests concerning access, correction, or privacy can be sent to <a href="mailto:privacy@looptalk.app">privacy@looptalk.app</a>.</p>
    <h2>Children and changes</h2>
    <p>LoopTalk is not directed to children under 13, or the higher minimum age required in their country. We may update this policy and will publish the effective date here. Material changes will be communicated through the service where appropriate.</p>
  </>
);

const TermsContent = () => (
  <>
    <p>Effective August 1, 2026</p>
    <h2>Using LoopTalk</h2><p>You must provide accurate registration information, protect your account, and be legally able to accept these terms. You are responsible for activity performed through your account.</p>
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
    <p>For account, messaging, call, notification, accessibility, or billing questions, email <a href="mailto:support@looptalk.app">support@looptalk.app</a>. Include your username, platform, app version, and a description of the problem. Never send your password or authentication token.</p>
    <h2>Safety reports</h2><p>Use Report user on a profile or Report message from a message&apos;s action menu. Use Block to stop new direct communication. If someone is in immediate danger, contact local emergency services before contacting LoopTalk.</p>
    <h2>Privacy requests</h2><p>For access, correction, deletion, or other privacy requests, use the controls in Settings or email <a href="mailto:privacy@looptalk.app">privacy@looptalk.app</a> from the address associated with your account.</p>
    <h2>Response times</h2><p>We prioritize urgent safety and account-security issues. Standard support requests are normally acknowledged within two business days.</p>
  </>
);

const AccountDeletionContent = () => (
  <>
    <h2>Delete in the app</h2>
    <ol><li>Sign in to LoopTalk.</li><li>Open Settings.</li><li>Select Delete account.</li><li>Review both confirmation prompts and select Delete permanently.</li></ol>
    <p>Deletion takes effect immediately. Your account, contacts, invitations, device tokens, direct conversations, and sent messages are removed. Group ownership is transferred before deletion so remaining members can continue their group.</p>
    <h2>When you cannot access the app</h2><p>Email <a href="mailto:privacy@looptalk.app?subject=LoopTalk%20account%20deletion">privacy@looptalk.app</a> from the email associated with your account. We will verify ownership before processing the request.</p>
    <h2>Data that may remain</h2><p>Limited abuse-report snapshots, security logs, backups, and records required by law may be retained for the minimum necessary period. These records are access restricted and are not used to operate a deleted account.</p>
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
    <main className="legal-main" id="main-content">
      <header><p className="eyebrow">LoopTalk</p><h1>{title}</h1><p>{description}</p></header>
      <article><Content /></article>
    </main>
  );
}
