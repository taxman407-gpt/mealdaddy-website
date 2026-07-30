const proteinOptions = [
  {
    id: "chicken",
    aliases: ["chicken"],
    group: "omnivore",
    priority: 12,
    build: (target) => portion(target, 8.5, .5, "oz cooked chicken breast")
  },
  {
    id: "steak",
    aliases: ["beef", "steak"],
    group: "omnivore",
    priority: 10,
    build: (target) => portion(target, 7, .5, "oz lean steak")
  },
  {
    id: "turkey",
    aliases: ["turkey"],
    group: "omnivore",
    priority: 9,
    build: (target) => portion(target, 8, .5, "oz cooked turkey breast")
  },
  {
    id: "pork",
    aliases: ["pork"],
    group: "omnivore",
    priority: 7,
    build: (target) => portion(target, 7.5, .5, "oz cooked pork loin")
  },
  {
    id: "salmon",
    aliases: ["fish", "salmon"],
    group: "pescatarian",
    priority: 11,
    build: (target) => portion(target, 6.5, .5, "oz cooked salmon")
  },
  {
    id: "tuna",
    aliases: ["fish", "tuna"],
    group: "pescatarian",
    priority: 9,
    build: (target) => portion(target, 7, .5, "oz tuna")
  },
  {
    id: "shrimp",
    aliases: ["seafood", "shrimp"],
    group: "pescatarian",
    priority: 8,
    build: (target) => portion(target, 7, .5, "oz cooked shrimp")
  },
  {
    id: "greek-yogurt",
    aliases: ["greek yogurt", "yogurt", "dairy", "milk", "lactose"],
    group: "vegetarian",
    priority: 10,
    build: (target) => portion(target, 20, .25, "cup Greek yogurt", "cups Greek yogurt")
  },
  {
    id: "cottage-cheese",
    aliases: ["cottage cheese", "cheese", "dairy", "milk", "lactose"],
    group: "vegetarian",
    priority: 7,
    build: (target) => portion(target, 25, .25, "cup cottage cheese", "cups cottage cheese")
  },
  {
    id: "eggs",
    aliases: ["egg", "eggs"],
    group: "vegetarian",
    priority: 8,
    build: (target) => target >= 35
      ? "3 eggs plus ¾ cup egg whites (about 38g protein)"
      : target >= 25
        ? "2 eggs plus ½ cup egg whites (about 26g protein)"
        : "2 eggs plus ¼ cup egg whites (about 20g protein)"
  },
  {
    id: "tofu",
    aliases: ["tofu", "soy"],
    group: "vegan",
    priority: 8,
    build: (target) => portion(target, 20, .25, "cup extra-firm tofu", "cups extra-firm tofu")
  },
  {
    id: "beans",
    aliases: ["bean", "beans", "lentil", "lentils", "legume", "edamame"],
    group: "vegan",
    priority: 7,
    build: (target) => target >= 35
      ? "1¼ cups lentils plus 1 cup shelled edamame (about 40g protein)"
      : target >= 25
        ? "1 cup lentils plus ½ cup shelled edamame (about 27g protein)"
        : "1 cup cooked lentils (about 18g protein)"
  }
];

function normalized(value) {
  return String(value || "").toLowerCase().replaceAll("-", " ").replace(/\s+/g, " ").trim();
}

function containsAlias(text, aliases) {
  return aliases.some((alias) => text.includes(alias));
}

function formattedAmount(value) {
  const whole = Math.floor(value);
  const fraction = Math.round((value - whole) * 4);
  const suffix = ["", "¼", "½", "¾"][fraction] || "";
  if (!whole) return suffix || "0";
  return `${whole}${suffix}`;
}

function portion(target, proteinPerUnit, step, singular, plural = singular) {
  const amount = Math.max(step, Math.ceil((target / proteinPerUnit) / step) * step);
  const estimatedProtein = Math.round(amount * proteinPerUnit);
  const unit = amount === 1 ? singular : plural;
  return `${formattedAmount(amount)} ${unit} (about ${estimatedProtein}g protein)`;
}

function allowedGroups(dietText) {
  if (dietText.includes("vegan")) return new Set(["vegan"]);
  if (dietText.includes("vegetarian")) return new Set(["vegetarian", "vegan"]);
  if (dietText.includes("pescatarian")) return new Set(["pescatarian", "vegetarian", "vegan"]);
  return new Set(["omnivore", "pescatarian", "vegetarian", "vegan"]);
}

export function buildProteinGuidance({
  targetProtein = 40,
  favoriteProteins = [],
  foodsLoved = "",
  foodsDisliked = "",
  foodsToAvoid = "",
  diet = "",
  eatingStyles = [],
  goals = [],
  biggestChallenge = ""
} = {}) {
  const target = Math.min(40, Math.max(18, Math.round(Number(targetProtein) || 40)));
  const favoritesText = normalized(Array.isArray(favoriteProteins) ? favoriteProteins.join(" ") : favoriteProteins);
  const lovedText = normalized(foodsLoved);
  const excludedText = normalized(`${foodsDisliked} ${foodsToAvoid}`);
  const preferenceText = normalized([diet, ...(eatingStyles || []), ...(goals || [])].join(" "));
  const challengeText = normalized(biggestChallenge);
  const groups = allowedGroups(preferenceText);
  const heartFocused = /\b(mediterranean|dash|heart healthy|reduce inflammation)\b/.test(preferenceText);
  const carbFocused = /\b(low carb|keto|better blood sugar)\b/.test(preferenceText);
  const needsConvenience = /\b(time|busy|travel|pain|rarely cook|don't cook|do not cook)\b/.test(challengeText);

  const ranked = proteinOptions
    .filter((option) => groups.has(option.group))
    .filter((option) => !containsAlias(excludedText, option.aliases))
    .map((option) => {
      const favoriteMatch = containsAlias(favoritesText, option.aliases);
      const lovedMatch = containsAlias(lovedText, option.aliases);
      let score = option.priority;
      if (favoriteMatch) score += 100;
      if (lovedMatch) score += 55;
      if (heartFocused && ["salmon", "tuna", "chicken", "greek-yogurt", "tofu", "beans"].includes(option.id)) score += 8;
      if (carbFocused && ["chicken", "steak", "turkey", "salmon", "tuna", "shrimp", "eggs"].includes(option.id)) score += 7;
      if (needsConvenience && ["tuna", "greek-yogurt", "cottage-cheese", "turkey", "eggs"].includes(option.id)) score += 5;
      return { ...option, favoriteMatch, lovedMatch, score };
    })
    .sort((left, right) => right.score - left.score || right.priority - left.priority);

  const chosen = ranked.slice(0, 3);
  if (!chosen.length) {
    return {
      target,
      personalized: false,
      ideas: [],
      text: `About ${target}g protein would be a useful next step, but your saved avoid-list rules out my usual examples. Tap “Make this specific” and tell me one protein you enjoy so I can recommend something safely.`
    };
  }

  const ideas = chosen.map((option) => option.build(target));
  const personalized = chosen.some((option) => option.favoriteMatch || option.lovedMatch);
  const list = new Intl.ListFormat(undefined, { style: "long", type: "disjunction" }).format(ideas);
  const lead = personalized
    ? "Starting with your saved favorites, that could look like"
    : "A few practical ways to get close are";

  return {
    target,
    personalized,
    ideas,
    text: `About ${target}g protein would move you closer. ${lead} ${list}. Portions and protein values are estimates, so brands and cuts can vary.`
  };
}
