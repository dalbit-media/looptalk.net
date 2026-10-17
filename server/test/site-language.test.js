const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Module = require("node:module");
const { transformSync } = require("@babel/core");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { load } = require("cheerio");
const { messages, t } = require("../../public/site/site-i18n");

const root = path.resolve(__dirname, "..", "..");
const modules = new Map();
const loadSiteModule = (filename) => {
  if (modules.has(filename)) return modules.get(filename).exports;
  const loaded = new Module(filename, module);
  loaded.paths = module.paths;
  loaded.require = (name) => {
    if (!name.startsWith(".")) return require(name);
    const target = path.resolve(path.dirname(filename), `${name}.js`);
    return target.startsWith(path.join(root, "app") + path.sep)
      ? loadSiteModule(target)
      : require(target);
  };
  const { code } = transformSync(fs.readFileSync(filename, "utf8"), {
    filename,
    babelrc: false,
    configFile: false,
    plugins: [
      ["@babel/plugin-transform-react-jsx", { runtime: "automatic" }],
      "@babel/plugin-transform-modules-commonjs",
    ],
  });
  modules.set(filename, loaded);
  loaded._compile(code, filename);
  return loaded.exports;
};
const loadComponent = (name) =>
  loadSiteModule(path.join(root, "app", "_components", `${name}.js`));

test("Korean site translations are available synchronously without a browser", () => {
  assert.equal(t("common.openApp"), "웹 앱 열기");
  assert.equal(t("common.copyright", { year: "2026" }), "© 2026 루프톡");
  assert.throws(() => t("missing.translation"), /Missing Korean site translation/);
});

test("the same dictionary still loads as a plain browser script", () => {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(
    path.join(root, "public", "site", "site-i18n.js"), "utf8"
  ), context);
  assert.equal(context.window.LoopTalkSiteI18n.ko["common.openApp"], t("common.openApp"));
  assert.equal(context.window.LoopTalkSiteI18n.en["common.openApp"], "Open web app");
});

test("landing content and shared navigation render in Korean before any scripts run", () => {
  const { SiteHeader, SiteFooter } = loadComponent("SiteChrome");
  const { default: LandingPage } = loadComponent("LandingPage");
  const html = renderToStaticMarkup(React.createElement(
    React.Fragment, null,
    React.createElement(SiteHeader),
    React.createElement(LandingPage),
    React.createElement(SiteFooter)
  ));
  const localized = [...html.matchAll(
    /<([a-z][\w-]*)\b[^>]*\bdata-i18n="([^"]+)"[^>]*>([^<]*)<\/\1>/g
  )];
  assert.ok(localized.length >= 60, "Check all initial localized text, not just the heading");
  for (const [, , key, text] of localized) {
    const expected = renderToStaticMarkup(React.createElement(
      React.Fragment, null, t(key, { year: String(new Date().getFullYear()) })
    ));
    assert.equal(text, expected, key);
  }
  assert.ok(html.includes(`aria-describedby="delivery-caption"`));
  assert.ok(html.includes(`aria-label="${t("common.primaryNavigation")}"`));
  assert.ok(html.includes(`title="${t("common.scrollToTop")}"`));
  assert.doesNotMatch(html, /Invitation-only messenger|Open web app|Coming soon|Friday loop/);
});

test("homepage focuses on ownership and closed-loop delivery with working navigation", () => {
  const { default: LandingPage } = loadComponent("LandingPage");
  const $ = load(renderToStaticMarkup(React.createElement(LandingPage)));
  assert.equal($("main").length, 1);
  assert.equal($("h1").length, 1);
  assert.equal($("h2").length, 4);
  assert.deepEqual($("main > section[id]").map((_, section) => $(section).attr("id")).get(),
    ["data-ownership", "start", "my-data", "roadmap"]);
  for (const anchor of $('a[href^="#"]').toArray()) {
    assert.equal($($(anchor).attr("href")).length, 1, "Section links resolve to unique targets");
  }
  for (const section of $("section[aria-labelledby]").toArray()) {
    assert.equal($(`#${$(section).attr("aria-labelledby")}`).length, 1);
  }
  assert.equal($("[data-open-client]").length, 2);
  assert.equal($('a[href="/privacy"]').length, 0);
  assert.equal($('a[href="/support"]').length, 1);
  assert.equal($("h1").text(), t("common.tagline"));
  assert.match($(".loop-lede").text(), /데이터와 대화의 통제권/);
  assert.equal($(".loop-promises, .loop-signoff, .loop-data-options").length, 0);
  assert.equal($(".loop-flow").length, 1);
  assert.equal($("#data-ownership .loop-flow > li").length, 3);
  assert.equal($(".loop-audiences, .loop-features, .loop-controls, .loop-start-steps").length, 0);
  assert.ok($("#start").text().includes(t("home.noInviteBody")));
  assert.equal($('[data-i18n="home.storeNote"]').length, 0);
  assert.equal($(".reveal").length, 0);
  assert.doesNotMatch($.text(), /카카오|크레딧|마켓플레이스/);
  assert.doesNotMatch($(".loop-hero, #data-ownership, #principles").text(), /Web3/);
  assert.doesNotMatch($.text(), /home\.[a-zA-Z]+/);
});

test("header and footer share the brand subtitle while splash omits preparation text", () => {
  const { SiteHeader, SiteFooter } = loadComponent("SiteChrome");
  const $ = load(renderToStaticMarkup(React.createElement(
    React.Fragment, null, React.createElement(SiteHeader), React.createElement(SiteFooter)
  )));
  assert.equal($(".site-header .wordmark-text b").text(), "루프톡");
  assert.equal($(".site-header .wordmark-text b + small").text(), "Web3 메신저의 표준");
  assert.equal($(".site-footer .wordmark-text b").text(), "루프톡");
  assert.equal($(".site-footer .wordmark-text b + small").text(), "Web3 메신저의 표준");
  const splash = fs.readFileSync(path.join(root, "mobile", "src", "components", "AppSplash.js"), "utf8");
  assert.match(splash, /t\("brand\.name"\)[\s\S]*?styles\.subtitle[\s\S]*?t\("brand\.subtitle"\)/);
  assert.doesNotMatch(splash, /onboarding\.preparing|styles\.status/);
});

test("every website page reuses the homepage header and shared content container", () => {
  const { default: SitePage } = loadComponent("SitePage");
  let homeHeader;
  for (const page of ["landing", "statistics", "invitations", "admin", "privacy", "terms", "support", "account-deletion"]) {
    const $ = load(renderToStaticMarkup(React.createElement(SitePage, { page })));
    assert.equal($(".site-header").length, 1, page);
    assert.equal($("main#main-content").length, 1, page);
    assert.equal($(".site-footer").length, 1, page);
    for (const selector of [".site-header", "main#main-content", ".site-footer"]) {
      assert.ok($(selector).hasClass("site-container"), `${page}: ${selector}`);
    }
    const header = $(".site-header").html();
    if (page === "landing") homeHeader = header;
    else assert.equal(header, homeHeader, page);
  }
  const css = fs.readFileSync(path.join(root, "app", "site.css"), "utf8");
  assert.match(css, /\.site-container\s*\{\s*width:\s*min\(1040px,\s*calc\(100%\s*-\s*48px\)\);\s*margin-inline:\s*auto;/);
  assert.match(css, /@media\s*\(max-width:\s*680px\)\s*\{\s*\.site-container\s*\{\s*width:\s*calc\(100%\s*-\s*32px\);/);
  assert.doesNotMatch(css, /\.(?:landing-page|admin-page|invitations-page)\s+\.site-header/);
});

test("mobile store coming-soon buttons are disabled below the main web-app action", () => {
  const { SiteHeader } = loadComponent("SiteChrome");
  const { default: LandingPage } = loadComponent("LandingPage");
  const $ = load(renderToStaticMarkup(React.createElement(
    React.Fragment, null, React.createElement(SiteHeader), React.createElement(LandingPage)
  )));
  const stores = $("main .loop-hero .store-actions");
  assert.equal(stores.length, 1);
  assert.equal(stores.attr("role"), "group");
  assert.equal(stores.attr("aria-label"), t("common.mobileDownloads"));
  assert.equal(stores.prev(".loop-actions").find("[data-open-client]").length, 1);
  assert.deepEqual(stores.find("button strong").map((_, element) => $(element).text()).get(),
    ["App Store", "Google Play"]);
  assert.equal(stores.find('button[type="button"][disabled]').length, 2);
  assert.deepEqual(stores.find(".store-logo").map((_, icon) => $(icon).attr("data-store-icon")).get(),
    ["apple", "google-play"]);
  assert.equal(stores.find('.store-logo[aria-hidden="true"] path').length, 2);
  assert.equal(new Set(stores.find(".store-logo path").map((_, mark) => $(mark).attr("d")).get()).size, 2);
  assert.equal(stores.find("a, [data-open-client]").length, 0);
  for (const button of stores.find("button").toArray()) {
    assert.ok($(button).text().includes(t("common.comingSoon")));
  }
  assert.equal($(".site-header .store-actions").length, 0);
});

test("private delivery is local-first without obsolete server-history notices", () => {
  const { default: LandingPage } = loadComponent("LandingPage");
  const $ = load(renderToStaticMarkup(React.createElement(LandingPage)));
  assert.equal($(".loop-hero h1").text(), t("common.tagline"));
  assert.equal($(".loop-storage-status").length, 0);
  assert.doesNotMatch($.text(), /그림은 앞으로의 설계입니다|아직 제공하지 않습니다/);
  assert.doesNotMatch($.text(), /이전 (대화|기록)|기존.*평문|Earlier message history/);
  assert.equal($(".loop-data-options").length, 0);
  assert.equal($(".loop-data-status").length, 0);
  for (const key of [
    "home.flow.encryptBody", "home.flow.deliverBody", "home.flow.flushBody",
  ]) {
    assert.ok($("#data-ownership").text().includes(t(key)), key);
  }
  assert.match($("#data-ownership").text(), /모든 수신 기기가 메시지를 저장하면 서버의 임시 암호문을 삭제/);
  assert.match($("#data-ownership").text(), /오프라인 기기/);
});

test("website and app copy omit obsolete server-history retention notices", () => {
  const obsolete = /이전 (?:기록|대화).*서버|Earlier (?:messages|message history).*server|以前の履歴はサーバー/;
  for (const source of [
    path.join(root, "public", "site", "site-i18n.js"),
    path.join(root, "mobile", "src", "i18n", "i18n.js"),
    path.join(root, "app", "_components", "LegalPage.js"),
  ]) {
    assert.doesNotMatch(fs.readFileSync(source, "utf8"), obsolete);
  }
  assert.match(t("home.securityBody"), /프로필·연락처·설정은 본인의 키로 암호화/);
  assert.match(t("admin.stats.serverCanRead"), /운영자 안내·답장은 평문/);
  const legal = fs.readFileSync(path.join(root, "app", "_components", "LegalPage.js"), "utf8");
  assert.match(legal, /Offline devices can keep ciphertext queued indefinitely/);
  assert.doesNotMatch(legal, /Earlier message history|retroactively encrypted/);
});

test("individual data ownership uses affirmative copy without promising untraceability", () => {
  const { default: LandingPage } = loadComponent("LandingPage");
  const $ = load(renderToStaticMarkup(React.createElement(LandingPage)));
  const callout = $('#data-ownership aside[aria-labelledby="censorship-title"]');
  assert.equal(callout.length, 1);
  assert.equal(callout.find("#censorship-title").text(), t("home.censorshipTitle"));
  for (const key of ["home.censorshipEyebrow", "home.censorshipBody"]) {
    assert.ok(callout.text().includes(t(key)), key);
  }
  assert.equal(callout.parents("details").length, 0);
  assert.match(callout.text(), /기록은 각자의 기기에 보관/);
  assert.match(callout.text(), /대화의 통제권도 개인이 갖습니다/);
  assert.match(callout.find("#censorship-title").text(), /이야기가.*우리 사이에 머물도록/);
  assert.match(callout.text(), /대화 당사자의 것입니다/);
  assert.equal($('[data-i18n="home.censorshipLimit"]').length, 0);
  assert.doesNotMatch(callout.text(), /보장할 수는 없습니다|막아 주지는 않습니다/);
  assert.doesNotMatch($.text(), /추적 불가|추적할 수 없|완전한 익명|untraceable/i);
  assert.doesNotMatch($.text(), /검열이 불가능합니다|검열할 수 없습니다|검열 걱정 없는|완전한 검열 저항/);
});

test("homepage promotes private conversations between loved ones without promising authority-proof safety", () => {
  const { default: LandingPage } = loadComponent("LandingPage");
  const $ = load(renderToStaticMarkup(React.createElement(LandingPage)));
  assert.equal($(".loop-hero h1").text(), "광고 · 검열 없이 안전하게 소통하세요");
  assert.equal($('[data-i18n="common.tagline"]').length, 1);
  assert.equal($(".loop-hero-copy > .loop-eyebrow").text(), t("common.taglineGoal"));
  assert.equal(t("common.footerTagline"), t("common.tagline"));
  assert.equal(t("home.signoff"), t("common.tagline"));
  assert.equal(t("landing.featureTitle"), t("common.tagline"));
  assert.ok(t("meta.landingTitle").includes(t("common.tagline")));
  assert.ok(t("meta.landingDescription").includes(t("common.tagline")));
  assert.match($(".loop-lede").text(), /기록의 주인은 우리여야 합니다/);
  assert.match($(".loop-lede").text(), /개인에게 돌려줍니다/);
  assert.doesNotMatch($(".loop-lede").text(), /수신 확인|서버에서 삭제/);
  assert.doesNotMatch($.text(), /어떤 기관도 접근할 수 없습니다|모든 검열로부터 안전합니다|당국에 절대 공개되지 않습니다/);
});

test("homepage removes generic messenger selling points while retaining access requirements", () => {
  const { default: LandingPage } = loadComponent("LandingPage");
  const $ = load(renderToStaticMarkup(React.createElement(LandingPage)));
  assert.match($(".loop-diagram-outcome").text(), /수신 확인 → 서버에서 삭제/);
  assert.match($(".loop-hero-caption").text(), /기존 이용자의 추천·초대로만 가입/);
  for (const button of $("[data-open-client]").toArray()) {
    assert.equal($(button).text(), t("home.openApp"));
  }
  assert.match($(".loop-faq").text(), /초대가 없다면 아직 가입할 수 없습니다/);
  assert.doesNotMatch($.text(), /음성·영상 통화|그룹 대화|파일과 링크|광고 없는|읽음 표시로|가족의 오늘|연락처 정리/);
  for (const eyebrow of $(".loop-eyebrow").toArray()) {
    assert.doesNotMatch($(eyebrow).text(), /YOUR|CLOSED LOOP|PRIVATE BY DESIGN/);
  }
});

test("homepage explains referral-only access and invitations as the foundation of future Web3 migration", () => {
  const { default: LandingPage } = loadComponent("LandingPage");
  const $ = load(renderToStaticMarkup(React.createElement(LandingPage)));
  const start = $("#start");
  assert.equal(start.children().length, 2);
  assert.equal(start.find(".loop-faq").parent().attr("class"), "loop-start-copy");
  assert.equal(start.find(".loop-start-copy > div #start-title").length, 1);
  assert.equal(start.find(".loop-start-copy").next("figure.loop-trust").length, 1);
  assert.match($(".loop-hero-caption").text(), /기존 이용자의 추천·초대로만 가입/);
  assert.match(start.find(".loop-section-lede").text(), /지인의 추천으로 이어지는 연결/);
  assert.match(start.find(".loop-section-lede").text(), /스팸과 봇의 유입을 줄이고/);
  assert.match(start.find(".loop-section-lede").text(), /실제 사람과 진짜 대화/);
  assert.equal(start.find('a[href="#roadmap"]').text(), t("home.roadmap.link"));
  assert.equal(start.find(".loop-invitation-future").length, 0);
  assert.match($("#roadmap").text(), /초대를 생태계의 기본 재화/);
  assert.doesNotMatch(start.text(), /실명 인증|스팸이 전혀|봇이 없는|수익 보장|토큰 지급/);
  assert.match(start.find(".loop-faq").text(), /초대가 없다면 아직 가입할 수 없습니다/);
  for (const item of start.find("[data-i18n]").toArray()) {
    assert.equal($(item).text(), t($(item).attr("data-i18n")));
  }
});

test("invitation section illustrates growing trust and future community-led moderation accessibly", () => {
  const { default: LandingPage } = loadComponent("LandingPage");
  const $ = load(renderToStaticMarkup(React.createElement(LandingPage)));
  const figure = $("#start figure.loop-trust");
  assert.equal(figure.length, 1);
  assert.equal(figure.attr("aria-labelledby"), "trust-title");
  assert.equal(figure.find("#trust-title").text(), t("home.trust.title"));
  for (const id of figure.attr("aria-describedby").split(" ")) {
    assert.equal(figure.find(`#${id}`).length, 1, id);
  }
  assert.equal(figure.find("svg").attr("aria-hidden"), "true");
  assert.equal(figure.find(".loop-trust-person").length, 11);
  assert.equal(figure.find(".loop-trust-growth").length, 3);
  assert.equal(figure.find(".loop-trust-ballot").length, 11);
  assert.equal(figure.find(".loop-trust-review-links path").length, 8);
  assert.equal(figure.find(".loop-trust-risk, .loop-trust-resolved").length, 2);
  assert.equal(figure.find(".loop-trust-stages > li").length, 3);
  const toggle = figure.find('label input[type="checkbox"]');
  assert.equal(toggle.length, 1);
  assert.ok(toggle.is("[checked]"));
  assert.ok(toggle.parent().text().includes(t("home.trust.animate")));
  assert.match(figure.find("#trust-description").text(), /모든 이용자가 참여하는 분산 거버넌스/);
  assert.match(figure.find("#trust-note").text(), /미래.*개념도.*현재는 차단·신고.*향후 설계·검증/);
  const css = fs.readFileSync(path.join(root, "app", "site.css"), "utf8");
  assert.match(css, /--trust-cycle:\s*16s/);
  assert.match(css, /\.loop-trust:has\(\.loop-trust-toggle:not\(:checked\)\)\s+\*\s*\{\s*animation-play-state:\s*paused/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.loop-trust \* \{ animation: none !important;/);
});

test("data organization precedes the roadmap and distinguishes local browsing from planned cloud sync", () => {
  const { default: LandingPage } = loadComponent("LandingPage");
  const $ = load(renderToStaticMarkup(React.createElement(LandingPage)));
  const section = $("#my-data");
  assert.equal(section.next().attr("id"), "roadmap");
  assert.equal(section.attr("aria-labelledby"), "my-data-title");
  assert.equal(section.find("h2").text(), t("home.data.title"));
  assert.equal(section.find(".loop-data-bar").length, 5);
  assert.equal(section.find(".loop-data-blocks > span").length, 40);
  assert.equal(section.find(".loop-data-tags > span").length, 3);
  assert.equal(section.find(".loop-data-providers li").length, 4);
  assert.deepEqual(section.find(".loop-provider-logo").map((_, logo) => $(logo).attr("data-provider-icon")).get(),
    ["microsoft-onedrive", "google-drive", "apple-icloud", "dropbox"]);
  assert.equal(new Set(section.find(".loop-provider-logo path").map((_, mark) => $(mark).attr("d")).get()).size, 4);
  const css = fs.readFileSync(path.join(root, "app", "site.css"), "utf8");
  assert.match(css, /\.loop-data-providers \.loop-provider-logo\s*\{[^}]*fill:\s*currentColor;[^}]*stroke:\s*none;[^}]*filter:\s*grayscale\(1\)/);
  for (const provider of ["Microsoft OneDrive", "Google Drive", "Apple iCloud", "Dropbox"]) {
    assert.ok(section.text().includes(provider));
  }
  assert.match(section.text(), /유형.*목록이나 갤러리/);
  assert.match(section.text(), /내용·파일명·태그/);
  assert.match(section.find("#data-preview-note").text(), /使用|사용 예시/);
  assert.match(section.find(".loop-caption").text(), /연결·백업·동기화·업로드는 동작하지 않습니다/);
  assert.equal(section.find("button, input, a").length, 0, "Cloud previews do not pretend to connect");
  const nas = section.find(".loop-data-nas");
  assert.equal(nas.length, 1);
  assert.equal(nas.prev().attr("data-i18n"), "home.data.cloudNote");
  assert.equal(nas.attr("aria-labelledby"), "personal-nas-title");
  assert.equal(nas.find("#personal-nas-title").text(), t("home.data.nasTitle"));
  assert.match(nas.text(), /개인 NAS.*계획.*현재 NAS 연결·백업·동기화는 제공하지 않습니다/);
  assert.equal(nas.find(".loop-data-nas-status").text(), t("home.data.nasStatus"));
});

test("Web3 roadmap separates current referral access from human-led governance, economy, and agent-resistance goals", () => {
  const { default: LandingPage } = loadComponent("LandingPage");
  const $ = load(renderToStaticMarkup(React.createElement(LandingPage)));
  const roadmap = $("#roadmap");
  assert.equal(roadmap.attr("aria-labelledby"), "roadmap-title");
  assert.equal($("main > section:last-child").attr("id"), "roadmap");
  assert.equal(roadmap.find(".loop-roadmap-timeline > li").length, 11);
  assert.equal(roadmap.find(".loop-roadmap-status").first().text(), "현재의 기반");
  assert.ok(roadmap.find(".loop-roadmap-status").slice(1).toArray().every((item) => $(item).text() === "잠정 목표"));
  const dates = roadmap.find("time").toArray();
  assert.deepEqual(dates.map((date) => $(date).attr("aria-label")), [
    "2026 Q4", "2027 Q2", "2028 Q1", "2029 Q2", "2030 Q1", "2031 Q2",
    "2032 Q1", "2033 Q2", "2034 Q1", "2035 Q2", "2036 Q4",
  ]);
  const months = dates.map((date) => $(date).attr("datetime"));
  assert.equal(months[0], "2026-10");
  assert.equal(months.at(-1), "2036-10");
  assert.deepEqual(months, [...months].sort());
  assert.match(roadmap.find(".loop-roadmap-note").text(), /잠정 로드맵.*조정됩니다/);
  assert.match(roadmap.text(), /토큰 발행과 지갑 수.*대화와 신뢰 관계/);
  assert.match(roadmap.text(), /신뢰가 확인된 구성원.*분산 거버넌스.*설계할 계획/);
  assert.match(roadmap.text(), /지갑·계정 수나 자산 보유량만으로 영향력을 늘릴 수 없는/);
  assert.match(roadmap.text(), /실제 기여.*참여와 분배/);
  assert.match(roadmap.text(), /AI 에이전트의 대량 가입과 다중 계정/);
  assert.match(roadmap.text(), /신뢰가 확인된 실제 사람만.*참여 주체/);
  assert.match(roadmap.find(".loop-caption").text(), /초대만으로 사람 여부를 인증하지는 않으며/);
  assert.match(roadmap.find(".loop-caption").text(), /향후 설계·검증할 목표/);
  assert.doesNotMatch(roadmap.text(), /봇이 없는|AI가 침투할 수 없는|수익 보장|토큰 지급|출시 확정/);
});

test("data-handling details live in the shared footer without homepage section headings", () => {
  const { default: LandingPage } = loadComponent("LandingPage");
  const { SiteHeader, SiteFooter } = loadComponent("SiteChrome");
  const $ = load(renderToStaticMarkup(React.createElement(
    React.Fragment, null, React.createElement(SiteHeader), React.createElement(LandingPage), React.createElement(SiteFooter)
  )));
  assert.equal($("main #principles, main .loop-security-note").length, 0);
  assert.equal($('main [data-i18n="home.securityTitle"], main [data-i18n="home.securityEyebrow"]').length, 0);
  assert.equal($('main [data-i18n="home.securityBody"]').length, 0);
  const notice = $("footer details.footer-data-notice");
  assert.equal(notice.length, 1);
  assert.equal(notice.attr("id"), "principles");
  assert.equal(notice.attr("open"), undefined);
  assert.equal(notice.find("h1, h2, h3").length, 0);
  assert.equal(notice.find("summary").text(), t("home.securityDetails"));
  assert.equal(notice.find("p").text(), t("home.securityBody"));
  assert.equal(notice.find("a").attr("href"), "/privacy");
  assert.equal($('header a[data-i18n="common.whyLoopTalk"]').attr("href"), "/#data-ownership");
  assert.match(notice.text(), /HTTPS.*WebSocket/);
  assert.match(notice.text(), /프로필·연락처·설정은 본인의 키로 암호화/);
  assert.match(notice.text(), /공개 키.*임의 식별자·연결 정보/);
  assert.match(notice.text(), /이메일 또는 전화번호와 비밀번호로 로그인/);
  assert.doesNotMatch($.text(), /완벽한 보안|100% 안전|군사급|종단간 암호화로 보호/);
});

test("homepage replaces chat screenshots with an accessible closed-loop delivery diagram", () => {
  const { default: LandingPage } = loadComponent("LandingPage");
  const $ = load(renderToStaticMarkup(React.createElement(LandingPage)));
  const diagram = $(".loop-hero figure");
  assert.equal(diagram.length, 1);
  assert.equal(diagram.attr("aria-label"), t("home.diagram.label"));
  assert.equal(diagram.attr("aria-describedby"), "delivery-caption");
  assert.equal(diagram.find("h2, .loop-diagram-status, .loop-diagram-heading").length, 0);
  assert.doesNotMatch(diagram.text(), /전달하고, 비우다|목표 설계 · 아직 미구현/);
  assert.equal($("#delivery-caption").text(), t("home.diagram.caption"));
  assert.equal($(".loop-preview, .loop-app-shot, .loop-hero img").length, 0);
  assert.equal(diagram.find(".loop-delivery-node").length, 3);
  assert.equal(diagram.find(".loop-delivery-visual[aria-hidden=true]").length, 1);
  assert.equal(diagram.find(".loop-device-icon").length, 2);
  assert.equal(diagram.find(".loop-server-icon").length, 1);
  assert.equal(diagram.find(".loop-receipt-icon").length, 0);
  assert.equal(diagram.find(".loop-diagram-orbit, .loop-local-halos, .loop-receipt-route, .loop-delete-icon").length, 0);
  assert.equal(diagram.find(".loop-packet-outbound, .loop-packet-inbound, .loop-received-message").length, 3);
  assert.equal(diagram.find(".loop-encrypted-packet").length, 2);
  assert.equal(diagram.find(".loop-encryption-label").length, 2);
  assert.deepEqual(diagram.find(".loop-encryption-label").map((_, label) => $(label).text()).get(), ["암호화", "암호화"]);
  assert.equal(diagram.find(".loop-local-storage").length, 2);
  assert.equal(diagram.find(".loop-local-label").length, 2);
  assert.equal(diagram.find(".loop-local-label").first().text(), t("home.diagram.localLabel"));
  assert.equal(diagram.find(".loop-diagram-outcome strong").text(), t("home.diagram.localOnly"));
  assert.equal(diagram.find(".loop-server-copy").length, 1);
  assert.equal(diagram.find("rect.loop-mosaic-pixel").length, 20);
  assert.equal(diagram.find(".loop-fume-bit, .loop-fume-wisp").length, 0);
  const pixelStyles = diagram.find(".loop-mosaic-pixel").map((_, pixel) => $(pixel).attr("style")).get();
  assert.equal(new Set(pixelStyles.map(style => style.match(/--pixel-color:(#[0-9a-f]+)/)[1])).size, 6);
  assert.equal(diagram.children().first().hasClass("loop-diagram-outcome"), true);
  assert.equal(diagram.find(".loop-motion-control").length, 0);
  assert.equal(diagram.next(".loop-diagram-toolbar").find('label .loop-motion-toggle[type="checkbox"][checked]').length, 1);
  assert.equal(diagram.parent().hasClass("loop-diagram-panel"), true);
  assert.match($("#delivery-caption").text(), /대화 기록은 참여자의 기기에만 남습니다/);
  assert.match($("#delivery-caption").text(), /모자이크 픽셀로 흩어져 사라/);
  assert.equal(diagram.find(".loop-message-route").attr("marker-end"), "url(#delivery-arrow)");
  assert.equal(diagram.find(".loop-message-route").length, 2);
  assert.equal(diagram.find(".loop-diagram-description .loop-delivery-track").length, 1);
  const visibleCopy = diagram.find(".loop-diagram-heading, .loop-diagram-text, .loop-diagram-outcome").text();
  assert.ok(visibleCopy.replace(/\s/g, "").length <= 75, "Keep the illustration icon-led, with only short labels");
  assert.match(diagram.find(".loop-delivery-sender").text(), /기기에서 메시지를 암호화/);
  assert.match(diagram.find(".loop-delivery-relay").text(), /전달 전까지만 암호문 보관/);
  assert.match(diagram.find(".loop-flush-rule").text(), /수신 확인.*메시지 삭제/);
  assert.match(diagram.find(".loop-delivery-recipient").text(), /수신 · 복호화 · 개인 보관/);
  assert.match(diagram.find(".loop-delivery-receipt").text(), /서버에 수신 확인 전송/);
  assert.match(diagram.find("figcaption").text(), /읽음 표시가 아니라/);
  for (const item of diagram.find("[data-i18n]").toArray()) {
    assert.equal($(item).text(), t($(item).attr("data-i18n")));
  }
});

test("delivery animation scatters pixels on receipt without a returning ACK", () => {
  const css = fs.readFileSync(path.join(root, "app", "site.css"), "utf8");
  const animations = [...css.matchAll(/animation: (loop-[\w-]+) (\d+)s linear infinite/g)];
  assert.equal(animations.length, 6);
  for (const [, name, duration] of animations) {
    assert.equal(duration, "8", `${name} uses the faster synchronized cycle`);
  }
  assert.doesNotMatch(css, /loop-confirm-receipt|loop-receipt-icon/);
  for (const name of ["loop-receive-message", "loop-show-receipt"]) {
    assert.match(css, new RegExp(`@keyframes ${name} \\{\\s*0%, 57% \\{ opacity: 0; \\}\\s*58%, 96% \\{ opacity: 1; \\}`));
  }
  assert.match(css, /@keyframes loop-flush-mosaic \{[\s\S]*?58% \{ opacity: 1;/);
  assert.match(css, /@keyframes loop-flush-copy \{[\s\S]*?58%, 100% \{ opacity: 0;/);
});

test("admin and statistics headings and loading states render in Korean without window", () => {
  const { default: AdminPage } = loadComponent("AdminPage");
  for (const publicView of [false, true]) {
    const html = renderToStaticMarkup(React.createElement(AdminPage, { publicView }));
    assert.ok(html.includes(t("admin.stats.pageTitle")));
    assert.ok(html.includes(t("admin.stats.loading")));
    assert.doesNotMatch(html, /SYSTEM STATISTICS|LIVE SERVICE DATA|>admin\.stats\./);
  }
});

test("initial page metadata matches the Korean browser metadata", () => {
  const { getPageView } = loadSiteModule(path.join(root, "app", "_lib", "siteData.js"));
  for (const page of ["landing", "admin", "statistics", "invitations"]) {
    const view = getPageView(page);
    assert.equal(view.title, messages.ko[`meta.${page}Title`]);
    assert.equal(view.description, messages.ko[`meta.${page}Description`]);
    assert.equal(view.structuredData.description, view.description);
  }
});

test("invitation maps have a public localized page and navigation next to Statistics", () => {
  const { SiteHeader } = loadComponent("SiteChrome");
  const $ = load(renderToStaticMarkup(React.createElement(SiteHeader)));
  assert.equal($('a[href="/statistics"]').next('a[href="/invitations"]').text(), t("common.invitations"));
  const { default: InvitationsPage } = loadComponent("InvitationsPage");
  const page = load(renderToStaticMarkup(React.createElement(InvitationsPage)));
  assert.equal(page("h1").text(), t("invitations.title"));
  assert.equal(page('[role="status"]').text(), t("invitations.loading"));
  const { getPageView } = loadSiteModule(path.join(root, "app", "_lib", "siteData.js"));
  assert.equal(getPageView("invitations").canonicalPath, "/invitations");
  assert.equal(getPageView("invitations").noIndex, false);
  assert.equal(getPageView("invitations").bodyClass, "invitations-page");
});
