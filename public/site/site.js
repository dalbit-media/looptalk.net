(() => {
  const body = document.body;
  const messages = window.LoopTalkSiteI18n;
  const supportedLanguages = Object.keys(messages);
  const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
  const menuButton = document.querySelector("[data-toggle-menu]");
  const header = document.querySelector(".site-header");
  const incomingCallStorageKey = "looptalk:incoming-call";
  const callStatusChannelName = "looptalk-call-status";
  let activeLanguage = "en";
  let healthState = { status: "checking", timestamp: null };
  let incomingCallRinging = false;
  let incomingCallTimer = null;

  const readPreference = (key) => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  };

  const translate = (key, replacements = {}) => {
    const template = messages[activeLanguage]?.[key] || messages.en[key] || key;
    return Object.entries(replacements).reduce(
      (value, [name, replacement]) => value.replace(`{${name}}`, replacement),
      template
    );
  };

  const resolveLanguage = () => {
    const savedLanguage = readPreference("language");
    if (supportedLanguages.includes(savedLanguage)) return savedLanguage;

    const browserLanguages = navigator.languages?.length
      ? navigator.languages
      : [navigator.language];
    return browserLanguages
      .map((language) => language?.toLowerCase().split("-")[0])
      .find((language) => supportedLanguages.includes(language)) || "en";
  };

  const renderHealth = () => {
    const chip = document.querySelector("[data-server-status]");
    if (!chip) return;
    const isOnline = healthState.status === "online";
    const isOffline = healthState.status === "offline";
    const statusKey = isOnline
      ? "health.operational"
      : isOffline ? "health.unavailable" : "health.checking";
    document.querySelectorAll("[data-health-label]").forEach((element) => {
      element.textContent = translate(statusKey);
    });
    document.querySelectorAll("[data-health-dot]").forEach((element) => {
      element.classList.toggle("online", isOnline);
      element.classList.toggle("offline", isOffline);
    });
    const healthTime = document.querySelector("[data-health-time]");
    if (healthTime) {
      healthTime.textContent = healthState.timestamp
        ? translate("health.checked", {
          time: new Date(healthState.timestamp).toLocaleTimeString(activeLanguage),
        })
        : translate("health.waiting");
    }
    chip.classList.toggle("online", isOnline);
    chip.classList.toggle("offline", isOffline);
    const status = chip.querySelector("[data-health-status]");
    if (status) {
      status.textContent = translate(
        isOnline
          ? "health.serverOnline"
          : isOffline ? "health.serverUnavailable" : "health.checkingServer"
      );
    }
  };

  const applyLanguage = (language = resolveLanguage()) => {
    activeLanguage = supportedLanguages.includes(language) ? language : "en";
    document.documentElement.lang = activeLanguage;
    document.querySelectorAll("[data-i18n]").forEach((element) => {
      element.textContent = translate(element.dataset.i18n, {
        year: String(new Date().getFullYear()),
      });
    });
    document.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
      element.setAttribute("aria-label", translate(element.dataset.i18nAriaLabel));
    });
    document.querySelectorAll("[data-i18n-title]").forEach((element) => {
      element.setAttribute("title", translate(element.dataset.i18nTitle));
    });
    const isAdmin = Boolean(document.querySelector(".admin-page"));
    const isLanding = Boolean(document.querySelector(".landing-page"));
    if (isAdmin || isLanding) {
      document.title = translate(isAdmin ? "meta.adminTitle" : "meta.landingTitle");
      document.querySelector('meta[name="description"]')?.setAttribute(
        "content",
        translate(isAdmin ? "meta.adminDescription" : "meta.landingDescription")
      );
    }
    renderHealth();
    renderIncomingCallBadge(incomingCallRinging);
  };

  const renderIncomingCallBadge = (ringing) => {
    incomingCallRinging = ringing;
    document.querySelectorAll("[data-call-badge]").forEach((badge) => {
      badge.hidden = !ringing;
    });
    document.querySelectorAll("[data-call-button]").forEach((button) => {
      button.setAttribute(
        "aria-label",
        translate(ringing ? "common.openAppIncoming" : "common.openApp")
      );
    });
  };

  const applyIncomingCallState = (state) => {
    const age = Date.now() - Number(state?.timestamp || 0);
    const ringing = state?.type === "incoming-call" && state.ringing === true && age < 60000;
    renderIncomingCallBadge(ringing);
    if (incomingCallTimer) clearTimeout(incomingCallTimer);
    incomingCallTimer = ringing
      ? setTimeout(() => renderIncomingCallBadge(false), Math.max(0, 60000 - age))
      : null;
  };

  const resolveTheme = () => {
    const savedTheme = readPreference("themeMode");
    if (savedTheme === "light" || savedTheme === "dark") return savedTheme;
    return systemTheme.matches ? "dark" : "light";
  };

  const applyTheme = () => {
    const theme = resolveTheme();
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      "content",
      theme === "dark" ? "#181a19" : "#f4f1e8"
    );
  };

  applyLanguage();
  applyTheme();

  window.addEventListener("storage", (event) => {
    if (event.key === "language") applyLanguage();
    if (event.key === "themeMode") applyTheme();
    if (event.key === incomingCallStorageKey && event.newValue) {
      try {
        applyIncomingCallState(JSON.parse(event.newValue));
      } catch {
        renderIncomingCallBadge(false);
      }
    }
  });
  systemTheme.addEventListener("change", () => {
    if (readPreference("themeMode") === "system" || !readPreference("themeMode")) {
      applyTheme();
    }
  });

  const openClient = () => {
    const width = Math.min(430, window.screen.availWidth);
    const height = Math.min(850, window.screen.availHeight);
    const left = Math.max(0, Math.round((window.screen.availWidth - width) / 2));
    const top = Math.max(0, Math.round((window.screen.availHeight - height) / 2));
    window.open(
      "/app/",
      "_blank",
      `popup=yes,noopener=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=no,menubar=no,toolbar=no,location=no,status=no`
    )?.focus();
  };

  document.querySelectorAll("[data-open-client]").forEach((button) => {
    button.addEventListener("click", openClient);
  });

  if (typeof BroadcastChannel === "function") {
    const callStatusChannel = new BroadcastChannel(callStatusChannelName);
    callStatusChannel.addEventListener("message", (event) => {
      applyIncomingCallState(event.data);
    });
  }
  try {
    const savedIncomingCall = localStorage.getItem(incomingCallStorageKey);
    if (savedIncomingCall) applyIncomingCallState(JSON.parse(savedIncomingCall));
  } catch {
    renderIncomingCallBadge(false);
  }

  menuButton?.addEventListener("click", () => {
    const isOpen = header?.classList.toggle("menu-open") ?? false;
    menuButton.setAttribute("aria-expanded", String(isOpen));
  });
  const revealObserver = new IntersectionObserver(
    (entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        revealObserver.unobserve(entry.target);
      }
    }),
    { threshold: 0.12 }
  );
  document.querySelectorAll(".reveal").forEach((element) => revealObserver.observe(element));

  const updateHealth = async () => {
    const chip = document.querySelector("[data-server-status]");
    if (!chip) return;
    try {
      const response = await fetch("/health", { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("Health request failed");
      const health = await response.json();
      healthState = { status: "online", timestamp: health.timestamp };
    } catch {
      healthState = { status: "offline", timestamp: null };
    }
    renderHealth();
  };

  updateHealth();
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations
          .filter((registration) => {
            const scriptUrl = registration.active?.scriptURL;
            if (!scriptUrl) return false;
            const pathname = new URL(scriptUrl).pathname;
            return pathname === "/service-worker.js" ||
              pathname === "/web-client/service-worker.js";
          })
          .map((registration) => registration.unregister())
      );
    });
  }
})();
