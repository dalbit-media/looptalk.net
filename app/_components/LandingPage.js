import { ArrowIcon, BrandMark } from "./SiteChrome";

const OpenClientButton = ({ className, labelKey, children }) => (
  <button className={className} type="button" data-open-client="">
    <span data-i18n={labelKey}>{children}</span>
    <ArrowIcon />
  </button>
);

export default function LandingPage() {
  return (
    <main id="main-content">
      <section className="hero band">
        <div className="hero-copy reveal">
          <p className="eyebrow" data-i18n="landing.eyebrow">Invitation-only messenger</p>
          <div className="hero-mark"><BrandMark id="hero" /></div>
          <h1 data-i18n="common.brandName">LoopTalk</h1>
          <p className="hero-lede" data-i18n="landing.lede">The people who matter, in a calmer loop. Private conversations, thoughtfully grouped contacts, and rich sharing across every screen.</p>
          <div className="hero-actions">
            <OpenClientButton className="button button-primary" labelKey="common.openLoopTalk">Open web app</OpenClientButton>
            <a className="text-link" href="#principles"><span data-i18n="landing.seeHow">See how it works</span><ArrowIcon /></a>
          </div>
          <div className="store-actions" aria-label="Mobile app downloads" data-i18n-aria-label="common.mobileDownloads">
            <button className="store-button" type="button" disabled><span><small data-i18n="common.downloadOn">Download on the</small><strong>App Store</strong></span><b data-i18n="common.comingSoon">Coming soon</b></button>
            <button className="store-button" type="button" disabled><span><small data-i18n="common.getItOn">Get it on</small><strong>Google Play</strong></span><b data-i18n="common.comingSoon">Coming soon</b></button>
          </div>
        </div>
        <div className="conversation-scene reveal" aria-label="A preview of a LoopTalk conversation" data-i18n-aria-label="landing.previewLabel">
          <div className="scene-header"><span className="avatar avatar-coral">MJ</span><span><strong data-i18n="landing.chatTitle">Friday loop</strong><small data-i18n="landing.chatStatus">4 people · active now</small></span></div>
          <div className="scene-messages">
            <p className="message received" data-i18n="landing.messageOne">Gallery at six? I saved the address.</p>
            <p className="message sent" data-i18n="landing.messageTwo">Perfect. I’ll meet you by the east entrance.</p>
            <div className="shared-place"><span className="place-marker">⌖</span><span><strong data-i18n="landing.place">Northline Gallery</strong><small data-i18n="landing.placeDetail">12 Mercer Street · 6:00 PM</small></span></div>
            <p className="message received short"><span data-i18n="landing.messageThree">See you there</span> <span>♥</span></p>
          </div>
          <div className="scene-composer"><span data-i18n="landing.writeMessage">Write a message</span><span className="send-dot">↗</span></div>
        </div>
        <a className="scroll-cue" href="#principles" aria-label="Explore LoopTalk" data-i18n-aria-label="landing.exploreLabel"><span /><b data-i18n="landing.explore">Explore</b></a>
      </section>

      <section className="principles band" id="principles">
        <div className="section-heading reveal">
          <p className="eyebrow" data-i18n="landing.principlesEyebrow">Made for real relationships</p>
          <h2 data-i18n="landing.principlesTitle">Your conversations should feel like yours.</h2>
        </div>
        <div className="principle-grid">
          <article className="principle reveal"><span>01</span><h3 data-i18n="landing.principleOneTitle">People, naturally organized</h3><p data-i18n="landing.principleOneBody">Keep family, friends, work, school, and projects in the circles where they belong.</p></article>
          <article className="principle reveal"><span>02</span><h3 data-i18n="landing.principleTwoTitle">Sharing without friction</h3><p data-i18n="landing.principleTwoBody">Send photos, videos, places, and links with previews that keep context close.</p></article>
          <article className="principle reveal"><span>03</span><h3 data-i18n="landing.principleThreeTitle">Private by invitation</h3><p data-i18n="landing.principleThreeBody">Every new account begins with a trusted invitation. No noisy public discovery layer.</p></article>
        </div>
      </section>

      <section className="feature-band band">
        <div className="feature-number reveal">50</div>
        <div className="feature-copy reveal"><p className="eyebrow" data-i18n="landing.featureEyebrow">Designed for focus</p><h2 data-i18n="landing.featureTitle">Messages load in clear, quick chapters.</h2><p data-i18n="landing.featureBody">Fast pagination, live presence, typing indicators, read receipts, reactions, replies, and local conversation history work together without crowding the screen.</p></div>
      </section>

      <section className="network-future band" id="network-future">
        <div className="future-intro reveal">
          <p className="eyebrow" data-i18n="landing.futureEyebrow">The network ahead</p>
          <h2 data-i18n="landing.futureTitle">Communication should create value for the people who sustain it.</h2>
          <p data-i18n="landing.futureBody">LoopTalk is exploring a next-generation communication network where trusted invitations grow real communities, useful contributions are recognized, and value circulates among participants.</p>
        </div>
        <div className="future-mission reveal">
          <p className="eyebrow" data-i18n="landing.missionEyebrow">Why this matters</p>
          <div>
            <h3 data-i18n="landing.missionTitle">The Web3 generation deserves communication infrastructure built for participation, not extraction.</h3>
            <p data-i18n="landing.missionPlatformBody">Large Web 2.0 platforms such as Meta, Kakao, and LINE have become gateways to communication, identity, commerce, and discovery across many regions. When a small number of companies mediate so much daily activity, attention, data, and economic opportunity tend to concentrate around the platform instead of remaining with local communities.</p>
            <p data-i18n="landing.missionLoopTalkBody">LoopTalk Network&apos;s mission is to bring communication back to everyone. We envision a network where people can build trusted communities, contributors share in the value they create, and digital activity supports local creators, services, and economies. That is what a communication app for the Web3 generation should become: open in participation, accountable in relationships, and useful to the communities it connects.</p>
          </div>
          <div className="future-dilemmas">
            <article><span>01</span><h4 data-i18n="landing.privacyTitle">Private by default. Public by choice.</h4><p data-i18n="landing.privacyBody">Modern messengers often blend private conversation with public discovery, advertising, and commerce. The result can blur who a conversation serves. People should decide when they are private, when they are visible, and how their identity and activity move between those spaces.</p></article>
            <article><span>02</span><h4 data-i18n="landing.alignmentTitle">Platform growth should not outrank participant interests.</h4><p data-i18n="landing.alignmentBody">A corporation naturally answers to its own sustainability and profit goals. Conflict appears when one company also controls communication, discovery, payments, and access to customers. A future network should make these incentives visible and keep individual users and local businesses represented in its rules.</p></article>
            <article><span>03</span><h4 data-i18n="landing.stewardshipTitle">Small, local stewardship over centralized control.</h4><p data-i18n="landing.stewardshipBody">LoopTalk envisions lean operating organizations that focus on compliance, safety, technical reliability, and facilitation. Communities and local operators should shape participation and economic activity close to where it happens, while shared standards keep the wider network trustworthy and interoperable.</p></article>
          </div>
        </div>
        <div className="future-path" aria-label="LoopTalk network roadmap" data-i18n-aria-label="landing.futureRoadmapLabel">
          <article className="future-step reveal"><span>01</span><div className="future-visual visual-invite" aria-hidden="true"><i /><i /><i /><b /></div><h3 data-i18n="landing.futureInviteTitle">Invitations build trust</h3><p data-i18n="landing.futureInviteBody">Future invitations will do more than open an account. They will connect people through accountable relationships and help healthy communities grow deliberately.</p></article>
          <article className="future-step reveal"><span>02</span><div className="future-visual visual-credit" aria-hidden="true"><b>C</b><i /><i /><i /></div><h3 data-i18n="landing.futureCreditTitle">Contribution earns credit</h3><p data-i18n="landing.futureCreditBody">People who strengthen the LoopTalk network will be eligible for digital credits. Credits are planned as network utility, not an investment product.</p></article>
          <article className="future-step reveal"><span>03</span><div className="future-visual visual-market" aria-hidden="true"><b /><i /><i /><i /><i /></div><h3 data-i18n="landing.futureMarketTitle">A marketplace within the loop</h3><p data-i18n="landing.futureMarketBody">A future Web3 marketplace will let participants use earned credits for digital goods, services, and experiences offered within the LoopTalk network.</p></article>
        </div>
        <p className="future-note reveal" data-i18n="landing.futureNote">Invitation rewards, digital credits, and marketplace features are part of the product roadmap and are not currently available.</p>
      </section>

      <section className="closing band">
        <div className="closing-inner reveal"><p className="eyebrow" data-i18n="landing.closingEyebrow">Close the distance</p><h2 data-i18n="landing.closingTitle">Bring your people into the loop.</h2><OpenClientButton className="button button-light" labelKey="landing.launchClient">Open web app</OpenClientButton></div>
      </section>
    </main>
  );
}
