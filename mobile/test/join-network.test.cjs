const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("guests can join a network later from banners, a screen and invitation links", () => {
  const api = read("src/api/auth.js");
  assert.match(api, /\/auth\/join-network/);
  assert.match(read("src/store/authStore.js"), /joinNetwork:\s*async/);
  assert.match(read("src/navigation/AppStack.js"), /name="JoinNetwork"/);
  const navigation = read("src/navigation/AppStack.js");
  assert.match(navigation, /<GuestJoinBanner /);
  assert.equal(navigation.split("screenLayout={renderTabScreenLayout}").length - 1, 5);
  assert.match(read("App.js"), /screen: "JoinNetwork"/);
  const i18n = read("src/i18n/i18n.js");
  for (const key of ["join.title", "join.button", "join.bannerTitle", "join.alreadyMember", "join.failed"]) {
    assert.equal(i18n.split(`"${key}"`).length - 1, 3, `${key} must exist in ko, en and ja`);
  }
});
