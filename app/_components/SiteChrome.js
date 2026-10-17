export function BrandMark() {
  return (
    <img className="brand-mark" src="/site/app-icon.svg" width="64" height="64" alt="" aria-hidden="true" />
  );
}

function BrandTitle() {
  return (
    <span className="wordmark-text">
      <b data-i18n="common.brandName">{t("common.brandName")}</b>
      <small data-i18n="common.brandSubtitle">{t("common.brandSubtitle")}</small>
    </span>
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
      <a className="skip-link" href="#main-content" data-i18n="common.skipContent">{t("common.skipContent")}</a>
      <header className="site-header site-container">
        <a className="wordmark" href="/" aria-label={t("common.homeLabel")} data-i18n-aria-label="common.homeLabel">
          <BrandMark id="header" />
          <BrandTitle />
        </a>
        <nav aria-label={t("common.primaryNavigation")} data-i18n-aria-label="common.primaryNavigation">
          <a href="/#data-ownership" data-i18n="common.whyLoopTalk">{t("common.whyLoopTalk")}</a>
          <a href="/statistics" data-i18n="common.admin">{t("common.admin")}</a>
          <a href="/invitations" data-i18n="common.invitations">{t("common.invitations")}</a>
          <button className="nav-client" type="button" data-open-client="" data-call-button="">
            <span data-i18n="common.openApp">{t("common.openApp")}</span>
            <span className="call-badge" data-call-badge="" aria-hidden="true" hidden>1</span>
          </button>
        </nav>
        <button className="icon-button mobile-menu" type="button" aria-label={t("common.toggleNavigation")} data-i18n-aria-label="common.toggleNavigation" data-toggle-menu="">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
      </header>
    </>
  );
}

export function SiteFooter({ showAdminAccess = false }) {
  return (
    <footer className="site-footer site-container">
      <a className="wordmark footer-brand" href="/"><BrandMark id="footer" /><BrandTitle /></a>
      <nav className="footer-links" aria-label={t("common.footerNavigation")} data-i18n-aria-label="common.footerNavigation">
        <a href="/privacy" data-i18n="common.privacy">{t("common.privacy")}</a>
        <a href="/terms" data-i18n="common.terms">{t("common.terms")}</a>
        <a href="/support" data-i18n="common.support">{t("common.support")}</a>
        <a href="/account-deletion" data-i18n="common.deleteAccount">{t("common.deleteAccount")}</a>
        {showAdminAccess && (
          <a href="/app/?returnTo=/admin" data-i18n="common.adminAccess">{t("common.adminAccess")}</a>
        )}
      </nav>
      <p className="footer-copyright" data-i18n="common.copyright">{t("common.copyright", { year: String(new Date().getFullYear()) })}</p>
      <details className="footer-data-notice" id="principles">
        <summary data-i18n="home.securityDetails">{t("home.securityDetails")}</summary>
        <p data-i18n="home.securityBody">{t("home.securityBody")}</p>
        <a className="text-link" href="/privacy"><span data-i18n="home.privacyLink">{t("home.privacyLink")}</span><ArrowIcon /></a>
      </details>
      <button className="scroll-top" type="button" aria-label={t("common.scrollToTop")} title={t("common.scrollToTop")} data-i18n-aria-label="common.scrollToTop" data-i18n-title="common.scrollToTop" data-scroll-top="" hidden>
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 14 6-6 6 6" /><path d="M12 8v12" /></svg>
      </button>
    </footer>
  );
}
import { t } from "../../public/site/site-i18n";
