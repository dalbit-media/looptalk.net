const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..", "..");
const manifest = require("../../mobile/manifest.json");

test("PWA manifest has stable identity, scope and real correctly sized install icons", () => {
  assert.equal(manifest.id, "/app/");
  assert.equal(manifest.start_url, "/app/");
  assert.equal(manifest.scope, "/app/");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.prefer_related_applications, false);
  for (const size of [192, 512]) {
    const icon = manifest.icons.find((entry) => entry.sizes === `${size}x${size}`);
    assert.ok(icon, `Missing ${size}px install icon`);
    assert.equal(icon.type, "image/png");
    const data = fs.readFileSync(path.join(root, "public", ...icon.src.split("/").filter(Boolean)));
    assert.equal(data.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(data.readUInt32BE(16), size);
    assert.equal(data.readUInt32BE(20), size);
  }
  const appleIcon = fs.readFileSync(path.join(root, "public", "site", "app-icon-180.png"));
  assert.equal(appleIcon.readUInt32BE(16), 180);
  assert.equal(appleIcon.readUInt32BE(20), 180);
});

test("Expo export adds consistent installation metadata without duplicates", () => {
  const filename = path.join(root, "mobile", "scripts", "prepare-web-pwa.js");
  const script = fs.readFileSync(filename, "utf8");
  let indexHtml = "<html><head></head><body></body></html>";
  let copied = 0;
  const mockedFs = {
    existsSync: () => true,
    readFileSync: () => indexHtml,
    writeFileSync: (file, html) => { indexHtml = html; },
    copyFileSync: (source, destination) => {
      assert.equal(source, path.join(root, "mobile", "manifest.json"));
      assert.equal(destination, path.join(root, "mobile", "dist", "manifest.webmanifest"));
      copied += 1;
    },
  };
  const prepare = () => vm.runInNewContext(script, {
    __dirname: path.dirname(filename),
    require: (name) => name === "node:fs" ? mockedFs : require(name),
  });
  prepare();
  const first = indexHtml;
  prepare();
  assert.equal(indexHtml, first);
  assert.equal(copied, 2);
  for (const attribute of [
    'rel="manifest"', 'rel="apple-touch-icon"', 'rel="icon"',
    'name="apple-mobile-web-app-capable"', 'name="apple-mobile-web-app-title"',
    'name="theme-color"',
  ]) {
    assert.equal(indexHtml.split(attribute).length - 1, 1);
  }
  assert.ok(indexHtml.includes('href="/app/manifest.webmanifest"'));
  assert.ok(indexHtml.includes('href="/site/app-icon-180.png"'));
  assert.ok(indexHtml.includes('href="/site/app-icon.svg"'));
});

test("brand assets provide transparent logos and platform-specific launcher icons", () => {
  for (const [file, size, colorType] of [
    ["public/site/app-icon-32.png", 32, 6],
    ["public/site/app-icon-192.png", 192, 6],
    ["public/site/app-icon-512.png", 512, 6],
    ["public/site/app-icon-180.png", 180, 2],
    ["mobile/assets/logo.png", 512, 6],
    ["mobile/assets/splash-icon.png", 512, 6],
    ["mobile/assets/icon.png", 1024, 2],
    ["mobile/assets/adaptive-icon.png", 1024, 6],
    ["mobile/assets/notification-icon.png", 96, 6],
    ["mobile/assets/favicon.png", 48, 6],
  ]) {
    const png = fs.readFileSync(path.join(root, ...file.split("/")));
    assert.equal(png.readUInt32BE(16), size, `${file} width`);
    assert.equal(png.readUInt32BE(20), size, `${file} height`);
    assert.equal(png[25], colorType, `${file} transparency format`);
  }
  const ico = fs.readFileSync(path.join(root, "public", "favicon.ico"));
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 3);
  for (const [index, size] of [16, 32, 48].entries()) {
    const entry = 6 + index * 16;
    assert.equal(ico[entry], size);
    assert.equal(ico[entry + 1], size);
    const offset = ico.readUInt32LE(entry + 12);
    assert.equal(ico.readUInt32LE(entry + 8), ico.subarray(offset, offset + ico.readUInt32LE(entry + 8)).length);
    assert.equal(ico.subarray(offset, offset + 8).toString("hex"), "89504e470d0a1a0a");
  }
  const config = require("../../mobile/app.json").expo;
  assert.equal(config.web.favicon, "./assets/favicon.png");
  const notifications = config.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === "expo-notifications")[1];
  assert.equal(notifications.icon, "./assets/notification-icon.png");
});
