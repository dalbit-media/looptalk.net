const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const babel = require("@babel/core");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const load = (relative, mocks) => {
  const filename = path.resolve(__dirname, "../src", relative);
  const { code } = babel.transformSync(fs.readFileSync(filename, "utf8"), {
    babelrc: false, configFile: false,
    plugins: [
      ["@babel/plugin-transform-react-jsx", { runtime: "automatic" }],
      "@babel/plugin-transform-modules-commonjs",
    ],
  });
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, console,
    require: (name) => {
      assert.ok(Object.hasOwn(mocks, name), `Unexpected dependency: ${name}`);
      return mocks[name];
    },
  }, { filename });
  return module.exports;
};

test("invitation creation shares only the disclosed display-name snapshot, not other vault fields", async () => {
  const requests = [];
  const devices = [];
  let vault = {
    profile: { displayName: "  Alice  ", bio: "Secret biography", email: "secret@example.test" },
    invitations: [], contacts: [], preferences: { private: true },
  };
  const api = load("api/invitations.js", {
    "../utils/secureMessaging": { ensureSecureDevice: async (userId, token) => {
      assert.equal(requests.length, devices.length);
      devices.push({ userId, token });
    } },
    "../utils/invitationCode": load("utils/invitationCode.js", {}),
    "./client": { api: { post: async (url, body) => {
      requests.push({ url, body });
      return { data: {
        code: "A".repeat(32), invitationUrl: "https://test.invalid/invite",
        expiresAt: "2026-12-01T00:00:00Z",
      } };
    } } },
    "../utils/ownerVault": {
      getOwnerIdentity: () => ({ userId: "issuer-routing-id", accountId: "private-auth-id" }),
      readOwnerVault: () => vault,
      updateOwnerVault: async (update) => { vault = update(vault); return vault; },
    },
  });
  const result = await api.createInvitation("token", "ko");
  assert.deepEqual(devices, [{ userId: "issuer-routing-id", token: "token" }]);
  assert.deepEqual(JSON.parse(JSON.stringify(requests)), [{
    url: "/invitations/create", body: { language: "ko", inviterDisplayName: "Alice" },
  }]);
  assert.equal(result.stats.linksShared, 1);
  assert.equal(vault.invitations.length, 1);
  vault.profile.displayName = " ";
  await api.createInvitation("token", "ko");
  assert.equal(Object.hasOwn(requests[1].body, "inviterDisplayName"), false);
});

test("invitation entry displays the shared name followed by the public username in parentheses", () => {
  let index = 0;
  const info = { inviter: { displayName: "Alice & Friends", username: "7ac40d92e681" } };
  const element = (tag) => ({ children }) => React.createElement(tag, null, children);
  const { InvitationScreen } = load("screens/auth/InvitationScreen.js", {
    react: {
      ...React, useEffect: () => {}, useRef: () => ({ current: 0 }),
      useState: (value) => [index++ === 1 ? info : value, () => {}],
    },
    "react/jsx-runtime": require("react/jsx-runtime"),
    "react-native": {
      ...Object.fromEntries(["View", "TouchableOpacity", "KeyboardAvoidingView", "ScrollView"].map((name) => [name, element("div")])),
      ActivityIndicator: element("span"), Platform: { OS: "web" }, StyleSheet: { create: (value) => value },
    },
    "../../components/AppText": { AppText: element("span") },
    "../../components/AppTextInput": { AppTextInput: element("input") },
    "../../api/invitations": {},
    "../../hooks/useTranslation": { useTranslation: () => (key) => key },
    "../../hooks/useAppTheme": { useAppTheme: () => ({ colors: {} }) },
    "../../utils/showAlert": { showAlert() {} },
    "../../utils/invitationCode": load("utils/invitationCode.js", {}),
  });

  const html = renderToStaticMarkup(React.createElement(InvitationScreen, {
    route: { params: { code: "A".repeat(32) } }, navigation: {},
  }));
  assert.match(html, /Alice &amp; Friends \(7ac40d92e681\)/);
  const creation = fs.readFileSync(path.resolve(__dirname, "../src/screens/app/AddContactScreen.js"), "utf8");
  assert.match(creation, /t\("contacts\.invitationNameDisclosure"\)/);
  assert.match(creation, /t\("contacts\.invitationWelcomeDisclosure"\)/);
});

test("invitation creation shows only two short notices in every supported language", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/screens/app/AddContactScreen.js"), "utf8");
  assert.doesNotMatch(source, /t\("contacts\.invitationLinkDescription"\)/);
  const { default: i18n } = load("i18n/i18n.js", { "i18n-js": require("i18n-js") });
  for (const locale of ["ko", "en", "ja"]) {
    for (const key of ["contacts.invitationNameDisclosure", "contacts.invitationWelcomeDisclosure"]) {
      const text = i18n.translations[locale][key];
      assert.ok(text.length > 0 && text.length <= 65, `${locale}: ${text}`);
      assert.equal(source.split(`t("${key}")`).length - 1, 1);
    }
  }
});

test("device registration failure explicitly prevents creating an invitation whose issuer cannot receive replies", async () => {
  let posted = false;
  const api = load("api/invitations.js", {
    "../utils/invitationCode": load("utils/invitationCode.js", {}),
    "../utils/secureMessaging": { ensureSecureDevice: async () => { throw new Error("Device registration unavailable"); } },
    "../utils/ownerVault": {
      readOwnerVault: () => ({ profile: { displayName: "Alice" } }),
      getOwnerIdentity: () => ({ userId: "issuer-routing-id" }),
    },
    "./client": { api: { post: async () => { posted = true; } } },
  });
  await assert.rejects(api.createInvitation("token", "en"), /Device registration unavailable/);
  assert.equal(posted, false);
});

test("paper invitation codes normalize case, spaces and hyphens while retaining old formats", () => {
  const client = load("utils/invitationCode.js", {});
  const server = require("../../server/src/utils/invitationCode");
  for (const input of ["7ac4m-9k2xe", " 7AC4M 9K2XE ", "ABCDEFGH", "a".repeat(32)]) {
    assert.equal(client.normalizeInvitationCode(input), server.normalizeInvitationCode(input));
    assert.equal(client.validInvitationCode(client.normalizeInvitationCode(input)), true);
  }
  for (const input of ["123", "7AC4M9K2X!", "0".repeat(10), "I".repeat(10), "O".repeat(10)]) {
    assert.equal(client.validInvitationCode(input), false);
    assert.equal(server.validInvitationCode(input), false);
  }
});
