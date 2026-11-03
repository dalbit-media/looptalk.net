document.getElementById("retry").addEventListener("click", () => {
  const target = new URLSearchParams(location.search).get("retry");
  if (target && /^https?:\/\//.test(target)) location.replace(target);
});
