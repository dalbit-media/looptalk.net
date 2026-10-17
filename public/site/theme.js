(() => {
  const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
  const applyTheme = () => {
    let savedTheme;
    try {
      savedTheme = window.localStorage.getItem("themeMode");
    } catch (error) {
      console.warn("Unable to read the saved theme; using the system preference.", error);
    }
    const theme = savedTheme === "light" || savedTheme === "dark"
      ? savedTheme
      : systemTheme.matches ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      "content",
      theme === "dark" ? "#181a19" : "#f4f1e8"
    );
  };

  applyTheme();
  document.addEventListener("DOMContentLoaded", applyTheme, { once: true });
  window.addEventListener("storage", (event) => {
    if (event.key === "themeMode" || event.key === null) applyTheme();
  });
  systemTheme.addEventListener("change", applyTheme);
})();