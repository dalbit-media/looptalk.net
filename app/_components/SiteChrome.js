export function BrandMark({ id }) {
  return (
    <svg className="brand-mark" aria-hidden="true" viewBox="0 0 64 64">
      <defs>
        <linearGradient id={`${id}-a`} x1="10" y1="10" x2="52" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#087bef" />
          <stop offset=".5" stopColor="#3758e8" />
          <stop offset="1" stopColor="#7847d6" />
        </linearGradient>
        <linearGradient id={`${id}-b`} x1="54" y1="18" x2="18" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor="#d92d78" />
          <stop offset=".5" stopColor="#ef4444" />
          <stop offset="1" stopColor="#c2410c" />
        </linearGradient>
      </defs>
      <path d="M11 28v-6c0-7 5-12 12-12h16c7 0 12 5 12 12v5c0 7-5 12-12 12H28L17 48l3-10c-5-1-9-5-9-10Z" fill="none" stroke={`url(#${id}-a)`} strokeWidth="5.5" strokeDasharray="10 2" strokeLinejoin="round" />
      <path d="M18 36v-6c0-7 5-12 12-12h13c7 0 12 5 12 12v8c0 6-5 11-11 11h-3l8 7-13-7h-6c-7 0-12-5-12-13Z" fill="none" stroke={`url(#${id}-b)`} strokeWidth="5.5" strokeDasharray="10 2" strokeDashoffset="5" strokeLinejoin="round" />
    </svg>
  );
}

export function ArrowIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" /></svg>;
}

export function PulseIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 12h4l2-7 4 14 2-7h6" /></svg>;
}

export function SiteHeader() {
  return (
    <>
      <a className="skip-link" href="#main-content" data-i18n="common.skipContent">Skip to content</a>
      <header className="site-header">
        <a className="wordmark" href="/" aria-label="LoopTalk home" data-i18n-aria-label="common.homeLabel">
          <BrandMark id="header" />
          <b data-i18n="common.brandName">LoopTalk</b>
        </a>
        <nav aria-label="Primary navigation" data-i18n-aria-label="common.primaryNavigation">
          <a href="/#principles" data-i18n="common.whyLoopTalk">Why LoopTalk</a>
          <a href="/statistics" data-i18n="common.admin">Statistics</a>
          <button className="nav-client" type="button" data-open-client="" data-call-button="">
            <span data-i18n="common.openApp">Open web app</span>
            <span className="call-badge" data-call-badge="" aria-hidden="true" hidden>1</span>
          </button>
        </nav>
        <button className="icon-button mobile-menu" type="button" aria-label="Toggle navigation" data-i18n-aria-label="common.toggleNavigation" data-toggle-menu="">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
      </header>
    </>
  );
}

export function SiteFooter({ showAdminAccess = false }) {
  return (
    <footer className="site-footer">
      <a className="wordmark footer-brand" href="/"><BrandMark id="footer" /><b data-i18n="common.brandName">LoopTalk</b></a>
      <nav className="footer-links" aria-label="Footer navigation" data-i18n-aria-label="common.footerNavigation">
        <a href="/privacy" data-i18n="common.privacy">Privacy</a>
        <a href="/terms" data-i18n="common.terms">Terms</a>
        <a href="/support" data-i18n="common.support">Support</a>
        <a href="/account-deletion" data-i18n="common.deleteAccount">Delete account</a>
        {showAdminAccess && (
          <a href="/app/?returnTo=/admin" data-i18n="common.adminAccess">Admin access</a>
        )}
      </nav>
      <p className="footer-copyright" data-i18n="common.copyright">© {new Date().getFullYear()} LoopTalk</p>
      <button className="scroll-top" type="button" aria-label="Scroll to top" title="Scroll to top" data-i18n-aria-label="common.scrollToTop" data-i18n-title="common.scrollToTop" data-scroll-top="" hidden>
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 14 6-6 6 6" /><path d="M12 8v12" /></svg>
      </button>
    </footer>
  );
}
