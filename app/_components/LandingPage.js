import { ArrowIcon } from "./SiteChrome";
import { t } from "../../public/site/site-i18n";
import TrustNetwork from "./TrustNetwork";
import DataOrganization from "./DataOrganization";

const Copy = ({ as: Tag = "p", id, className }) => (
  <Tag className={className} data-i18n={id}>{t(id)}</Tag>
);

const OpenClientButton = () => (
  <button className="button loop-button" type="button" data-open-client="">
    <Copy as="span" id="home.openApp" /><ArrowIcon />
  </button>
);

const storeMarks = [
  {
    name: "App Store",
    icon: "apple",
    path: "M18.71,19.5C17.88,20.74 17,21.95 15.66,21.97C14.32,22 13.89,21.18 12.37,21.18C10.84,21.18 10.37,21.95 9.1,22C7.79,22.05 6.8,20.68 5.96,19.47C4.25,17 2.94,12.45 4.7,9.39C5.57,7.87 7.13,6.91 8.82,6.88C10.1,6.86 11.32,7.75 12.11,7.75C12.89,7.75 14.37,6.68 15.92,6.84C16.57,6.87 18.39,7.1 19.56,8.82C19.47,8.88 17.39,10.1 17.41,12.63C17.44,15.65 20.06,16.66 20.09,16.67C20.06,16.74 19.67,18.11 18.71,19.5M13,3.5C13.73,2.67 14.94,2.04 15.94,2C16.07,3.17 15.6,4.35 14.9,5.19C14.21,6.04 13.07,6.7 11.95,6.61C11.8,5.46 12.36,4.26 13,3.5Z",
  },
  {
    name: "Google Play",
    icon: "google-play",
    path: "M3,20.5V3.5C3,2.91 3.34,2.39 3.84,2.15L13.69,12L3.84,21.85C3.34,21.6 3,21.09 3,20.5M16.81,15.12L6.05,21.34L14.54,12.85L16.81,15.12M20.16,10.81C20.5,11.08 20.75,11.5 20.75,12C20.75,12.5 20.53,12.9 20.18,13.18L17.89,14.5L15.39,12L17.89,9.5L20.16,10.81M6.05,2.66L16.81,8.88L14.54,11.15L6.05,2.66Z",
  },
];

const roadmapMilestones = [
  { phase: "trust", year: 2026, quarter: 4 },
  { phase: "invitation", year: 2027, quarter: 2 },
  { phase: "humanity", year: 2028, quarter: 1 },
  { phase: "agents", year: 2029, quarter: 2 },
  { phase: "participation", year: 2030, quarter: 1 },
  { phase: "governance", year: 2031, quarter: 2 },
  { phase: "economy", year: 2032, quarter: 1 },
  { phase: "pilot", year: 2033, quarter: 2 },
  { phase: "operations", year: 2034, quarter: 1 },
  { phase: "interoperability", year: 2035, quarter: 2 },
  { phase: "stewardship", year: 2036, quarter: 4 },
];

export default function LandingPage() {
  return (
    <main id="main-content" className="loop-home site-container">
      <section className="loop-hero" aria-labelledby="home-title">
        <div className="loop-hero-copy">
          <Copy className="loop-eyebrow" id="home.eyebrow" />
          <h1 id="home-title" data-i18n="common.tagline">{t("common.tagline")}</h1>
          <Copy className="loop-lede" id="home.lede" />
          <div className="loop-actions">
            <OpenClientButton />
            <a href="#data-ownership"><Copy as="span" id="home.explore" /><ArrowIcon /></a>
          </div>
          <div className="store-actions" role="group" aria-label={t("common.mobileDownloads")} data-i18n-aria-label="common.mobileDownloads">
            {storeMarks.map((store) => (
              <button className="store-button" type="button" disabled key={store.name}>
                <svg className="store-logo" data-store-icon={store.icon} viewBox="0 0 24 24" aria-hidden="true"><path d={store.path} /></svg>
                <strong>{store.name}</strong>
                <Copy as="b" id="common.comingSoon" />
              </button>
            ))}
          </div>
          <Copy className="loop-hero-caption" id="home.accessNote" />
        </div>
        <div className="loop-diagram-panel">
          <figure className="loop-diagram" aria-label={t("home.diagram.label")} data-i18n-aria-label="home.diagram.label" aria-describedby="delivery-caption">
           <p className="loop-diagram-outcome"><Copy as="strong" id="home.diagram.localOnly" /><Copy as="span" id="home.diagram.outcome" /></p>
          <svg className="loop-delivery-visual" viewBox="0 0 360 340" aria-hidden="true">
            <defs>
              <marker id="delivery-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                <path d="m2 1 6 4-6 4" />
              </marker>
            </defs>
            <path className="loop-message-route" d="M120 164v-22q0-67 39-67" markerEnd="url(#delivery-arrow)" />
            <path className="loop-message-route" d="M201 75q39 0 39 67v12" markerEnd="url(#delivery-arrow)" />
            <g className="loop-device-icon" transform="translate(78 65)">
              <rect x="12" y="99" width="60" height="116" rx="12" />
              <path d="M33 109h18m-14 95h10" />
              <rect className="loop-message-bubble" x="24" y="131" width="36" height="33" rx="8" />
              <path d="M35 145v-4a7 7 0 0 1 14 0v4m-15 0h16v12H34z" />
              <g className="loop-local-storage">
                <ellipse cx="42" cy="178" rx="13" ry="4" />
                <path d="M29 178v12c0 6 26 6 26 0v-12m-26 6c0 6 26 6 26 0" />
              </g>
            </g>
            <g className="loop-server-icon" transform="translate(72 -22) scale(.6)">
              <rect x="145" y="125" width="70" height="22" rx="6" />
              <rect x="145" y="153" width="70" height="22" rx="6" />
              <rect x="145" y="181" width="70" height="22" rx="6" />
              <path d="M158 136h24m-24 28h24m-24 28h24" />
              <circle cx="201" cy="136" r="2" /><circle cx="201" cy="164" r="2" /><circle cx="201" cy="192" r="2" />
            </g>
            <g className="loop-server-copy">
              <rect x="173" y="65" width="14" height="19" rx="3" />
              <path d="M177 73v-2a3 3 0 0 1 6 0v2m-7 0h8v7h-8z" />
            </g>
            <g className="loop-server-mosaic">
              {[
                [-76, -38], [-45, -55], [-18, -44], [36, -40], [76, -50],
                [-92, -12], [-57, -28], [-24, -59], [52, -22], [98, -18],
                [-81, 18], [-43, 8], [15, -51], [66, 10], [87, 24],
                [-64, 40], [-28, 32], [24, 19], [48, 37], [74, 48],
              ].map(([x, y], index) => (
                <rect className="loop-mosaic-pixel" x={169 + index % 5 * 5} y={64 + Math.floor(index / 5) * 5} width="4" height="4"
                  style={{
                    "--drift-x": `${x}px`, "--drift-y": `${y}px`,
                    "--pixel-color": ["#a8e5ce", "#7dcfff", "#b4a0ff", "#ff92c2", "#ffc878", "#fff3a6"][index % 6],
                  }} key={index} />
              ))}
            </g>
            <g className="loop-device-icon" transform="translate(-78 65)">
              <rect x="288" y="99" width="60" height="116" rx="12" />
              <path d="M309 109h18m-14 95h10" />
              <g className="loop-received-message">
                <rect className="loop-message-bubble" x="300" y="131" width="36" height="33" rx="8" />
                <path d="m310 147 6 6 11-13" />
              </g>
              <g className="loop-local-storage">
                <ellipse cx="318" cy="178" rx="13" ry="4" />
                <path d="M305 178v12c0 6 26 6 26 0v-12m-26 6c0 6 26 6 26 0" />
              </g>
            </g>
            <g className="loop-encrypted-packet loop-packet-outbound">
              <rect x="-10" y="-12" width="20" height="24" rx="4" />
              <path d="M-4-1v-3a4 4 0 0 1 8 0v3m-9 0H5v9H-5z" />
            </g>
            <g className="loop-encrypted-packet loop-packet-inbound">
              <rect x="-10" y="-12" width="20" height="24" rx="4" />
              <path d="M-4-1v-3a4 4 0 0 1 8 0v3m-9 0H5v9H-5z" />
            </g>
            <g className="loop-diagram-text">
              <text className="loop-encryption-label" x="104" y="124" textAnchor="end" data-i18n="home.diagram.encryptionLabel">{t("home.diagram.encryptionLabel")}</text>
              <text className="loop-encryption-label" x="256" y="124" textAnchor="start" data-i18n="home.diagram.encryptionLabel">{t("home.diagram.encryptionLabel")}</text>
              <text x="120" y="302" data-i18n="home.diagram.senderLabel">{t("home.diagram.senderLabel")}</text>
              <text x="180" y="38" data-i18n="home.diagram.relayLabel">{t("home.diagram.relayLabel")}</text>
              <text x="240" y="302" data-i18n="home.diagram.recipientLabel">{t("home.diagram.recipientLabel")}</text>
              <text className="loop-local-label" x="120" y="324" data-i18n="home.diagram.localLabel">{t("home.diagram.localLabel")}</text>
              <text className="loop-local-label" x="240" y="324" data-i18n="home.diagram.localLabel">{t("home.diagram.localLabel")}</text>
              <text className="loop-receipt-label" x="180" y="139" data-i18n="home.diagram.receiptLabel">{t("home.diagram.receiptLabel")}</text>
            </g>
          </svg>
          <div className="loop-diagram-description">
          <ol className="loop-delivery-track">
            <li className="loop-delivery-node loop-delivery-sender">
              <span className="loop-node-number" aria-hidden="true">01</span>
              <div><Copy as="h3" id="home.diagram.senderTitle" /><Copy id="home.diagram.senderBody" /></div>
            </li>
            <li className="loop-delivery-transfer"><span aria-hidden="true">↓</span><Copy as="span" id="home.diagram.encrypted" /></li>
            <li className="loop-delivery-node loop-delivery-relay">
              <span className="loop-node-number" aria-hidden="true">02</span>
              <div><Copy as="h3" id="home.diagram.relayTitle" /><Copy id="home.diagram.relayBody" /><Copy className="loop-flush-rule" id="home.diagram.flush" /></div>
            </li>
            <li className="loop-delivery-transfer"><span aria-hidden="true">↓</span><Copy as="span" id="home.diagram.forward" /></li>
            <li className="loop-delivery-node loop-delivery-recipient">
              <span className="loop-node-number" aria-hidden="true">03</span>
              <div><Copy as="h3" id="home.diagram.recipientTitle" /><Copy id="home.diagram.recipientBody" /></div>
            </li>
            <li className="loop-delivery-receipt"><span aria-hidden="true">↰</span><Copy as="span" id="home.diagram.receipt" /></li>
          </ol>
          </div>
          <figcaption id="delivery-caption" className="loop-diagram-description"><Copy as="span" id="home.diagram.caption" /></figcaption>
          </figure>
          <div className="loop-diagram-toolbar">
            <label className="loop-motion-control">
              <input className="loop-motion-toggle" type="checkbox" defaultChecked />
              <Copy as="span" id="home.diagram.motion" />
            </label>
          </div>
        </div>
      </section>

      <section className="loop-section" id="data-ownership" aria-labelledby="ownership-title">
        <div className="loop-section-heading">
          <Copy className="loop-eyebrow" id="home.ownershipEyebrow" />
          <h2 id="ownership-title" data-i18n="home.ownershipTitle">{t("home.ownershipTitle")}</h2>
        </div>
        <ol className="loop-flow">
          {["encrypt", "deliver", "flush"].map((name) => (
            <li key={name}>
              <Copy as="h3" id={`home.flow.${name}Title`} />
              <Copy id={`home.flow.${name}Body`} />
            </li>
          ))}
        </ol>
        <aside className="loop-attention" aria-labelledby="censorship-title">
          <Copy className="loop-eyebrow" id="home.censorshipEyebrow" />
          <h3 id="censorship-title" data-i18n="home.censorshipTitle">{t("home.censorshipTitle")}</h3>
          <Copy id="home.censorshipBody" />
        </aside>
      </section>

      <section className="loop-section loop-start" id="start" aria-labelledby="start-title">
        <div className="loop-start-copy">
          <div>
            <Copy className="loop-eyebrow" id="home.startEyebrow" />
            <h2 id="start-title" data-i18n="home.startTitle">{t("home.startTitle")}</h2>
            <Copy className="loop-section-lede" id="home.startBody" />
            <a className="text-link loop-text-link" href="#roadmap"><Copy as="span" id="home.roadmap.link" /><ArrowIcon /></a>
            <div className="loop-actions"><OpenClientButton /><a href="/support"><Copy as="span" id="home.supportLink" /><ArrowIcon /></a></div>
          </div>
          <details className="loop-faq">
            <Copy as="summary" id="home.noInviteTitle" />
            <Copy id="home.noInviteBody" />
          </details>
        </div>
        <TrustNetwork />
      </section>

      <DataOrganization />

      <section className="loop-section" id="roadmap" aria-labelledby="roadmap-title">
        <div className="loop-section-heading">
          <Copy className="loop-eyebrow" id="home.roadmap.eyebrow" />
          <h2 id="roadmap-title" data-i18n="home.roadmap.title">{t("home.roadmap.title")}</h2>
          <Copy className="loop-section-lede" id="home.roadmap.body" />
          <Copy className="loop-roadmap-note" id="home.roadmap.scheduleNote" />
        </div>
        <ol className="loop-roadmap-timeline" role="list">
          {roadmapMilestones.map(({ phase, year, quarter }, index) => (
            <li key={phase}>
              <time className="loop-roadmap-date" dateTime={`${year}-${String(quarter * 3 - 2).padStart(2, "0")}`} aria-label={`${year} Q${quarter}`}>
                <strong>{year}</strong><span>Q{quarter}</span>
              </time>
              <div className="loop-roadmap-milestone">
                <Copy as="span" className="loop-roadmap-status" id={`home.roadmap.${index === 0 ? "currentStatus" : "plannedStatus"}`} />
                <Copy as="h3" id={`home.roadmap.${phase}Title`} />
                <Copy id={`home.roadmap.${phase}Body`} />
              </div>
            </li>
          ))}
        </ol>
        <aside className="loop-attention" aria-labelledby="roadmap-human-title">
          <Copy className="loop-eyebrow" id="home.roadmap.humanEyebrow" />
          <h3 id="roadmap-human-title" data-i18n="home.roadmap.humanTitle">{t("home.roadmap.humanTitle")}</h3>
          <Copy id="home.roadmap.humanBody" />
        </aside>
        <Copy className="loop-caption" id="home.roadmap.scope" />
      </section>

    </main>
  );
}
