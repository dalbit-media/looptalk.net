const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const babel = require("@babel/core");

test("chat header uses available width instead of a fixed name cap and keeps memo badge compact", () => {
  const filename = path.resolve(__dirname, "..", "src", "screens", "app", "ChatScreen.js");
  const source = fs.readFileSync(filename, "utf8");
  const ast = babel.parseSync(source, { babelrc: false, configFile: false, parserOpts: { plugins: ["jsx"] } });
  const declaration = ast.program.body.find((node) => node.type === "VariableDeclaration" &&
    node.declarations[0].id.name === "createStyles").declarations[0].init;
  const styles = vm.runInNewContext(`(${source.slice(declaration.start, declaration.end)})({})`, {
    StyleSheet: { create: (value) => value }, Platform: { OS: "web", select: (values) => values.web || values.default },
  });
  assert.equal(styles.headerProfileTitle.maxWidth, undefined);
  assert.equal(styles.headerProfileTitle.flexShrink, 1);
  assert.equal(styles.headerProfileDetails.flex, undefined, "Intrinsic name width must not collapse inside the header title");
  assert.equal(styles.headerProfileDetails.flexShrink, 1);
  assert.equal(styles.headerProfileAvatar.flexShrink, 0);
  assert.equal(styles.notesChip.flexShrink, 0);
  const translationsSource = fs.readFileSync(path.resolve(__dirname, "..", "src", "i18n", "i18n.js"), "utf8");
  const labels = [...translationsSource.matchAll(/"messages.personalNotes": "([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(labels, ["메모", "Memo", "メモ"]);
});
