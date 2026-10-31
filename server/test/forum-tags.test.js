const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeTags, suggestTags } = require("../../shared/forumTags");

test("topic suggestions use English, Korean and Japanese text with bounded general fallback", () => {
  assert.deepEqual(suggestTags("A travel trip with good food"), ["travel", "food"]);
  assert.deepEqual(suggestTags("게임 개발과 음악"), ["technology", "music", "gaming"]);
  assert.deepEqual(suggestTags("旅行と料理"), ["travel", "food"]);
  assert.deepEqual(suggestTags("Hello everyone"), ["general"]);
  assert.equal(suggestTags("tech travel food music gaming work learning exercise").length, 5);
  assert.deepEqual(suggestTags("chair"), ["general"]);
});

test("tags enforce exact limits, normalization, reserved tag protection and fallback", () => {
  assert.deepEqual(normalizeTags([]), ["general"]);
  assert.deepEqual(normalizeTags([" Travel ", "travel", "태그", "旅行"]), ["travel", "태그", "旅行"]);
  assert.deepEqual(normalizeTags(["a".repeat(24)]), ["a".repeat(24)]);
  assert.equal(normalizeTags(["a", "b", "c", "d", "e"]).length, 5);
  for (const tags of [null, "general", [null], [""], ["has space"], ["a".repeat(25)],
    ["a", "b", "c", "d", "e", "f"], ["not-invited"], [" NOT-INVITED "]]) {
    assert.throws(() => normalizeTags(tags));
  }
});
