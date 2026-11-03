// The root package.json version 0.0.N is shown to people as build "v.0N".
module.exports = (version = "") => `v.${String(Number(String(version).split(".")[2]) || 0).padStart(2, "0")}`;
