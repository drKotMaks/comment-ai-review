const POSITIVE_KEYWORDS = [
  "amazing",
  "beautiful",
  "comfortable",
  "excellent",
  "fantastic",
  "great",
  "love",
  "loved",
  "perfect",
  "wonderful"
];

const NEGATIVE_KEYWORDS = [
  "awful",
  "bad",
  "cheap",
  "disappointed",
  "hate",
  "poor",
  "return",
  "terrible",
  "uncomfortable",
  "worst"
];

const CATEGORY_KEYWORDS = [
  {
    segment: "fit_and_sizing",
    keywords: ["size", "sizing", "fit", "fits", "tight", "loose", "petite", "large", "small"]
  },
  {
    segment: "material_and_quality",
    keywords: ["fabric", "material", "quality", "stitch", "seam", "cotton", "silk", "knit"]
  },
  {
    segment: "style_and_appearance",
    keywords: ["style", "color", "pattern", "print", "design", "look", "cute", "flattering"]
  },
  {
    segment: "overall_wearability_and_value",
    keywords: ["price", "value", "wear", "versatile", "comfortable", "worth", "everyday"]
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
