const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");

const root = path.resolve(__dirname, "../..");
const site = path.join(root, "public", "site");
const assets = path.join(root, "mobile", "assets");
const background = "#F5F7FA";

async function main() {
  const source = await fs.readFile(path.join(site, "app-icon.svg"));
  const render = (size) => sharp(source).resize(size, size);
  await Promise.all([
    ...[32, 192, 512].map((size) =>
      render(size).png().toFile(path.join(site, `app-icon-${size}.png`))),
    render(180).flatten({ background }).png().toFile(path.join(site, "app-icon-180.png")),
    render(1024).flatten({ background }).png().toFile(path.join(assets, "icon.png")),
    render(512).png().toFile(path.join(assets, "logo.png")),
    render(512).png().toFile(path.join(assets, "splash-icon.png")),
    render(48).png().toFile(path.join(assets, "favicon.png")),
    // Keep every colored pixel inside Android's circular adaptive-icon safe zone.
    render(600).extend({
      top: 212, bottom: 212, left: 212, right: 212,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    }).png().toFile(path.join(assets, "adaptive-icon.png")),
  ]);

  const { data, info } = await render(96).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let offset = 0; offset < data.length; offset += info.channels) {
    data[offset] = data[offset + 1] = data[offset + 2] = 255;
  }
  await sharp(data, { raw: info }).png().toFile(path.join(assets, "notification-icon.png"));

  const sizes = [16, 32, 48];
  const frames = await Promise.all(sizes.map((size) => render(size).png().toBuffer()));
  const header = Buffer.alloc(6 + sizes.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let imageOffset = header.length;
  frames.forEach((frame, index) => {
    const entry = 6 + index * 16;
    header[entry] = header[entry + 1] = sizes[index];
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(frame.length, entry + 8);
    header.writeUInt32LE(imageOffset, entry + 12);
    imageOffset += frame.length;
  });
  await fs.writeFile(path.join(root, "public", "favicon.ico"), Buffer.concat([header, ...frames]));
  console.log("Generated website, PWA, native, splash, notification, and favicon assets.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
