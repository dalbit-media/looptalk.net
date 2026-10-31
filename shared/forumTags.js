const TOPIC_RULES = [
  ["technology", /\b(tech(?:nology)?|software|coding|programming|computer|ai)\b|기술|개발|코딩|컴퓨터|技術|プログラミング|ソフトウェア/i],
  ["travel", /\b(travel|trip|vacation|tourism)\b|여행|휴가|旅行|観光/i],
  ["food", /\b(food|cook(?:ing)?|recipe|restaurant)\b|음식|요리|맛집|레시피|料理|レシピ|グルメ/i],
  ["music", /\b(music|song|concert|album)\b|음악|노래|콘서트|音楽|コンサート/i],
  ["gaming", /\b(gam(?:e|es|ing)|videogames?)\b|게임|ゲーム/i],
  ["work", /\b(work|career|job|office)\b|직장|업무|취업|仕事|職場/i],
  ["learning", /\b(learn(?:ing)?|study|school|education)\b|공부|학습|학교|교육|勉強|学習|学校/i],
  ["wellness", /\b(exercise|fitness|wellness|workout)\b|운동|건강|運動|健康/i],
];
const normalizeTags = (tags) => {
  if (!Array.isArray(tags) || tags.length > 5 ||
      tags.some((tag) => typeof tag !== "string" ||
        !/^[\p{L}\p{N}][\p{L}\p{N}-]{0,23}$/u.test(tag.trim()))) {
    throw new Error("Use up to 5 tags, each 1-24 letters, numbers or hyphens");
  }
  const normalized = [...new Set(tags.map((tag) => tag.trim().toLowerCase()))];
  if (normalized.includes("not-invited")) throw new Error("The not-invited tag is assigned automatically");
  return normalized.length ? normalized : ["general"];
};
const suggestTags = (text) => {
  const tags = TOPIC_RULES.filter(([, pattern]) => pattern.test(text)).map(([tag]) => tag).slice(0, 5);
  return tags.length ? tags : ["general"];
};

module.exports = { normalizeTags, suggestTags };
