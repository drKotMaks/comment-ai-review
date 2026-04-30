const POSITIVE_KEYWORDS = [
  "amazing",
  "beautiful",
  "comfortable",
  "excellent",
  "fantastic",
  "great",
  "happy",
  "keeping",
  "love",
  "loved",
  "perfect",
  "recommend",
  "wonderful",
  "в захваті",
  "задоволена",
  "ідеально",
  "люблю",
  "обожнюю",
  "рекомендую",
  "чудов"
];

const NEGATIVE_KEYWORDS = [
  "awful",
  "bad",
  "cheap",
  "disappointed",
  "disappointing",
  "hate",
  "ill fitting",
  "not recommend",
  "pass",
  "poor",
  "return",
  "returned",
  "returning",
  "terrible",
  "uncomfortable",
  "worst",
  "жахлив",
  "не рекомендую",
  "повернула",
  "повертаю",
  "розчарована"
];

const CATEGORY_KEYWORDS = [
  {
    segment: "fit_and_sizing",
    keywords: [
      "armhole",
      "bust",
      "chest",
      "fit",
      "fits",
      "fitting",
      "hip",
      "large",
      "length",
      "loose",
      "petite",
      "run large",
      "run small",
      "short",
      "size",
      "sizing",
      "small",
      "snug",
      "tight",
      "waist",
      "довжин",
      "завелик",
      "замал",
      "розмір",
      "сидить",
      "талі",
      "тісн"
    ]
  },
  {
    segment: "material_and_quality",
    keywords: [
      "button",
      "cotton",
      "fabric",
      "itchy",
      "knit",
      "lining",
      "material",
      "quality",
      "scratchy",
      "seam",
      "see through",
      "sheer",
      "silk",
      "stitch",
      "thin",
      "unravel",
      "wash",
      "zipper",
      "бавовн",
      "блискав",
      "матеріал",
      "прозор",
      "тканин",
      "тонк",
      "якіст"
    ]
  },
  {
    segment: "style_and_appearance",
    keywords: [
      "beautiful",
      "color",
      "cute",
      "design",
      "flattering",
      "look",
      "pattern",
      "photo",
      "picture",
      "print",
      "style",
      "unflattering",
      "вигляд",
      "візерунок",
      "дизайн",
      "колір",
      "мил",
      "принт",
      "стиль"
    ]
  },
  {
    segment: "overall_wearability_and_value",
    keywords: [
      "comfortable",
      "everyday",
      "occasion",
      "practical",
      "price",
      "value",
      "versatile",
      "wear",
      "wearable",
      "worth",
      "зручн",
      "носити",
      "практич",
      "ціна",
      "щодня"
    ]
  }
];

export function processReviewSimple(reviewText) {
  const text = reviewText.toLowerCase();
  const positiveScore = countKeywordMatches(text, POSITIVE_KEYWORDS);
  const negativeScore = countKeywordMatches(text, NEGATIVE_KEYWORDS);

  return {
    recommended: positiveScore >= negativeScore ? 1 : 0,
    reviewer_segment: classifySegment(text)
  };
}

function classifySegment(text) {
  let bestMatch = {
    segment: "overall_wearability_and_value",
    score: 0
  };

  for (const category of CATEGORY_KEYWORDS) {
    const score = countKeywordMatches(text, category.keywords);

    if (score > bestMatch.score) {
      bestMatch = {
        segment: category.segment,
        score
      };
    }
  }

  
  return bestMatch.segment;
}


function countKeywordMatches(text, keywords) {
  return keywords.reduce((count, keyword) => {
    return text.includes(keyword) ? count + 1 : count;
  }, 0);
}
