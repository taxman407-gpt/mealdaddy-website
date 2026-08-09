import { createClient } from "npm:@supabase/supabase-js@2.54.0";

const model = "gpt-5.6-luna";
const monthlyBudgetMicros = 3_000_000;
const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
  "content-type": "application/json"
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function namedKey(variable: string, fallback: string) {
  try {
    return JSON.parse(Deno.env.get(variable) ?? "{}").default ?? Deno.env.get(fallback);
  } catch {
    return Deno.env.get(fallback);
  }
}

function outputText(response: Record<string, unknown>) {
  const output = Array.isArray(response.output) ? response.output : [];
  for (const item of output as Array<Record<string, unknown>>) {
    const content = Array.isArray(item.content) ? item.content : [];
    for (const part of content as Array<Record<string, unknown>>) {
      if (part.type === "output_text" && typeof part.text === "string") return part.text;
    }
  }
  return "";
}

function webSearchSources(response: Record<string, unknown>) {
  const output = Array.isArray(response.output) ? response.output : [];
  const seen = new Set<string>();
  const sources: Array<{ title: string; url: string }> = [];
  for (const item of output as Array<Record<string, any>>) {
    if (item.type !== "web_search_call" || !Array.isArray(item.action?.sources)) continue;
    for (const source of item.action.sources as Array<Record<string, unknown>>) {
      const url = typeof source.url === "string" ? source.url : "";
      if (!/^https?:\/\//i.test(url) || seen.has(url)) continue;
      seen.add(url);
      sources.push({
        title: typeof source.title === "string" ? source.title.slice(0, 200) : "Web source",
        url
      });
      if (sources.length >= 8) return sources;
    }
  }
  return sources;
}

const restaurantPlanFormat = {
  type: "json_schema",
  name: "restaurant_plan",
  strict: true,
  schema: {
    type: "object",
    properties: {
      restaurant: { type: "string" },
      overview: { type: "string" },
      source_checked_on: { type: "string" },
      options: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            order: { type: "string" },
            substitutions: { type: "array", items: { type: "string" }, maxItems: 6 },
            why: { type: "string" },
            calories: { type: "number", minimum: 0, maximum: 10000 },
            protein_g: { type: "number", minimum: 0, maximum: 1000 },
            carbs_g: { type: "number", minimum: 0, maximum: 2000 },
            net_carbs_g: { type: "number", minimum: 0, maximum: 2000 },
            fat_g: { type: "number", minimum: 0, maximum: 1000 },
            fiber_g: { type: "number", minimum: 0, maximum: 500 },
            confidence: { type: "string", enum: ["low", "medium", "high"] },
            evidence_type: { type: "string", enum: ["restaurant_published", "restaurant_estimate"] },
            source_url: { type: "string" }
          },
          required: [
            "title", "order", "substitutions", "why", "calories", "protein_g", "carbs_g",
            "net_carbs_g", "fat_g", "fiber_g", "confidence", "evidence_type", "source_url"
          ],
          additionalProperties: false
        }
      }
    },
    required: ["restaurant", "overview", "source_checked_on", "options"],
    additionalProperties: false
  }
};

function normalizedRestaurantPlan(response: Record<string, unknown>) {
  const text = outputText(response).trim();
  if (!text) return null;
  let parsed: Record<string, any>;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed.options) || parsed.options.length !== 3) return null;
  const sources = webSearchSources(response);
  const allowedUrls = new Set(sources.map((source) => source.url));
  const today = new Date().toISOString().slice(0, 10);
  return {
    restaurant: String(parsed.restaurant || "Restaurant").slice(0, 160),
    overview: String(parsed.overview || "Three personalized ways to order.").slice(0, 500),
    source_checked_on: today,
    sources,
    options: parsed.options.map((option: Record<string, any>) => {
      const sourceUrl = allowedUrls.has(String(option.source_url || "")) ? String(option.source_url) : "";
      const published = option.evidence_type === "restaurant_published" && Boolean(sourceUrl);
      return {
        title: String(option.title || "Customized restaurant meal").slice(0, 160),
        order: String(option.order || "").slice(0, 500),
        substitutions: Array.isArray(option.substitutions)
          ? option.substitutions.map((value: unknown) => String(value).slice(0, 160)).slice(0, 6)
          : [],
        why: String(option.why || "").slice(0, 500),
        calories: Math.max(0, Number(option.calories || 0)),
        protein_g: Math.max(0, Number(option.protein_g || 0)),
        carbs_g: Math.max(0, Number(option.carbs_g || 0)),
        net_carbs_g: Math.max(0, Number(option.net_carbs_g || 0)),
        fat_g: Math.max(0, Number(option.fat_g || 0)),
        fiber_g: Math.max(0, Number(option.fiber_g || 0)),
        confidence: ["low", "medium", "high"].includes(option.confidence) ? option.confidence : "medium",
        evidence_type: published ? "restaurant_published" : "restaurant_estimate",
        source_url: sourceUrl
      };
    })
  };
}

function profileContext(profile: Record<string, any> | null) {
  const answers = profile?.onboarding_data ?? {};
  return {
    diet_style: profile?.diet_style,
    coaching_tone: profile?.coaching_tone,
    goals: answers.primary_goals,
    calorie_goal: answers.calorie_goal,
    protein_goal: answers.protein_goal,
    net_carb_goal: answers.net_carb_goal,
    eating_styles: answers.eating_styles,
    foods_to_avoid: answers.foods_to_avoid,
    medical_restrictions: answers.medical_restrictions,
    foods_loved: answers.foods_loved,
    foods_disliked: answers.foods_disliked,
    favorite_proteins: answers.favorite_proteins,
    favorite_cuisines: answers.favorite_cuisines,
    cooking_for: answers.cooking_for,
    grocery_budget: answers.grocery_budget,
    appliances: answers.appliances,
    favorite_restaurants: answers.favorite_restaurants,
    biggest_challenge: answers.biggest_challenge
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Authentication required." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = namedKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  // supabase-js 2.54 treats sb_secret keys as Bearer JWTs; use the legacy server key until migration to @supabase/server.
  const secretKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    namedKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  const openAiKey = Deno.env.get("OPENAI_API_KEY");
  if (!supabaseUrl || !publishableKey || !secretKey || !openAiKey) {
    return json({ error: "Meal Daddy coaching is not configured." }, 503);
  }

  const authClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authHeader } }
  });
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) return json({ error: "Authentication required." }, 401);

  let mode = "";
  let context = "";
  let nutritionContext: {
    calories: number;
    protein: number;
    totalCarbs: number;
    netCarbs: number;
    netCarbGoal: number | null;
  } | null = null;
  let location: {
    latitude: number;
    longitude: number;
    accuracyMeters: number;
    timezone: string;
  } | null = null;
  try {
    const body = await request.json();
    mode = typeof body.mode === "string" ? body.mode : "";
    context = typeof body.context === "string" ? body.context.trim().slice(0, 1000) : "";
    if (body.nutritionContext && typeof body.nutritionContext === "object") {
      const calories = Number(body.nutritionContext.calories);
      const protein = Number(body.nutritionContext.protein);
      const totalCarbs = Number(body.nutritionContext.totalCarbs);
      const netCarbs = Number(body.nutritionContext.netCarbs);
      const suppliedGoal = body.nutritionContext.netCarbGoal;
      const netCarbGoal = suppliedGoal === null || suppliedGoal === undefined
        ? null
        : Number(suppliedGoal);
      if (
        !Number.isFinite(calories) ||
        !Number.isFinite(protein) ||
        !Number.isFinite(totalCarbs) ||
        !Number.isFinite(netCarbs) ||
        calories < 0 ||
        calories > 20_000 ||
        protein < 0 ||
        protein > 2_000 ||
        totalCarbs < 0 ||
        totalCarbs > 2_000 ||
        netCarbs < 0 ||
        netCarbs > 2_000 ||
        (netCarbGoal !== null && (
          !Number.isFinite(netCarbGoal) ||
          netCarbGoal < 1 ||
          netCarbGoal > 1_000
        ))
      ) {
        return json({ error: "Invalid nutrition context." }, 400);
      }
      nutritionContext = {
        calories: Math.round(calories),
        protein: Math.round(protein),
        totalCarbs: Math.round(totalCarbs),
        netCarbs: Math.round(netCarbs),
        netCarbGoal: netCarbGoal === null ? null : Math.round(netCarbGoal)
      };
    }
    if (body.location && typeof body.location === "object") {
      const latitude = Number(body.location.latitude);
      const longitude = Number(body.location.longitude);
      const accuracyMeters = Math.max(0, Math.min(100_000, Number(body.location.accuracyMeters || 0)));
      if (
        Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 &&
        Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
      ) {
        location = {
          latitude: Number(latitude.toFixed(2)),
          longitude: Number(longitude.toFixed(2)),
          accuracyMeters: Number.isFinite(accuracyMeters) ? Math.round(accuracyMeters) : 0,
          timezone: typeof body.location.timezone === "string" ? body.location.timezone.slice(0, 100) : ""
        };
      }
    }
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  if (!["dinner", "restaurant"].includes(mode) || !context) {
    return json({ error: "Add a short request to continue." }, 400);
  }

  const admin = createClient(supabaseUrl, secretKey);
  const { data: membership } = await admin
    .from("subscriptions")
    .select("plan_key,status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (
    membership?.plan_key !== "core" ||
    !["trialing", "active", "past_due"].includes(membership.status)
  ) {
    return json({ error: "An active Meal Daddy Core membership is required." }, 402);
  }

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const { data: usageRows, error: usageError } = await admin
    .from("ai_usage_events")
    .select("estimated_cost_micros")
    .eq("user_id", user.id)
    .gte("created_at", monthStart.toISOString());
  if (usageError) return json({ error: "Usage could not be checked." }, 500);
  const usedMicros = (usageRows ?? []).reduce(
    (sum, row) => sum + Number(row.estimated_cost_micros || 0),
    0
  );
  if (usedMicros >= monthlyBudgetMicros) {
    return json({ error: "The monthly Core AI allowance has been reached." }, 429);
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("diet_style,coaching_tone,onboarding_data")
    .eq("user_id", user.id)
    .maybeSingle();

  const task = mode === "dinner"
    ? "Create one practical dinner plan. Give a concise menu, portions or protein target when useful, and a short preparation sequence. Prefer the user's ingredients and constraints. Keep it achievable tonight."
    : "Create exactly three restaurant choices in this order: A is the closest fit to today's goals, B is a balanced choice with more flexibility, and C is a treat option with practical harm-reducing substitutions. For a named restaurant, search the current web before recommending and prioritize the restaurant's official menu or nutrition pages. Use restaurant_published only when a searched source directly supports the nutrition values; otherwise use restaurant_estimate. Every source_url must exactly match a URL returned by web search. Keep order and substitution wording concise and personalized; never copy a restaurant's full marketing description.";
  const nutritionGuardrail = nutritionContext?.netCarbGoal
    ? `The user's saved hard daily net-carb ceiling is ${nutritionContext.netCarbGoal}g. They have logged approximately ${nutritionContext.netCarbs}g today, leaving ${Math.max(0, nutritionContext.netCarbGoal - nutritionContext.netCarbs)}g. Treat the remaining allowance as a hard constraint whenever possible. Estimate net carbs for each recommendation and show projected daily net carbs. Never recommend an option over the ceiling if a lower-carb option can meet the request. If the user is already at or over the ceiling, choose options with as close to zero additional net carbs as practical and say so clearly.`
    : "Treat any explicit numeric nutrition limit in the user's request as a hard constraint unless safety requires otherwise.";

  const systemText = `You are Meal Daddy, a practical nutrition and meal-planning coach. ${task} ${nutritionGuardrail} Respect listed allergies, restrictions, preferences, budget, and household needs. Do not diagnose, prescribe, or replace medical advice. Use a supportive, direct tone.${mode === "dinner" ? " Return plain text under 220 words." : " Nutrition numbers must reflect the customized order after substitutions. If exact numbers are unavailable, provide conservative estimates and lower confidence."}`;
  const userText = `Saved profile:\n${JSON.stringify(profileContext(profile))}\n\nToday's nutrition context:\n${JSON.stringify(nutritionContext)}\n\nApproximate area shared for this request:\n${JSON.stringify(location)}\n\nUser request:\n${context}`;
  const requestBody: Record<string, unknown> = {
      model,
      store: false,
      reasoning: { effort: "none" },
      max_output_tokens: mode === "restaurant" ? 1200 : 450,
      input: [
        {
          role: "system",
          content: [{
            type: "input_text",
            text: systemText
          }]
        },
        {
          role: "user",
          content: [{
            type: "input_text",
            text: userText
          }]
        }
      ],
      text: mode === "restaurant"
        ? { verbosity: "low", format: restaurantPlanFormat }
        : { verbosity: "low" }
  };
  if (mode === "restaurant") {
    requestBody.tools = [{ type: "web_search" }];
    requestBody.tool_choice = "auto";
    requestBody.include = ["web_search_call.action.sources"];
  }

  const callOpenAi = (body: Record<string, unknown>) => fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${openAiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });

  let openAiResponse = await callOpenAi(requestBody);
  if (mode === "restaurant" && [400, 403].includes(openAiResponse.status)) {
    const fallbackBody = { ...requestBody };
    delete fallbackBody.tools;
    delete fallbackBody.tool_choice;
    delete fallbackBody.include;
    fallbackBody.input = [
      {
        role: "system",
        content: [{
          type: "input_text",
          text: `${systemText} Current web search is unavailable for this request. Do not invent sources. Use restaurant_estimate, an empty source_url, and low or medium confidence.`
        }]
      },
      { role: "user", content: [{ type: "input_text", text: userText }] }
    ];
    openAiResponse = await callOpenAi(fallbackBody);
  }

  if (!openAiResponse.ok) {
    const errorBody = await openAiResponse.json().catch(() => ({}));
    return json({
      error: "Meal Daddy could not generate guidance right now.",
      code: errorBody?.error?.code ?? errorBody?.error?.type ?? ""
    }, 502);
  }

  const response = await openAiResponse.json();
  const restaurantPlan = mode === "restaurant" ? normalizedRestaurantPlan(response) : null;
  const guidance = mode === "restaurant" ? restaurantPlan?.overview ?? "" : outputText(response).trim();
  if (!guidance || (mode === "restaurant" && !restaurantPlan)) {
    return json({ error: "Meal Daddy returned an incomplete response. Please try again." }, 502);
  }

  const inputTokens = Number(response.usage?.input_tokens || 0);
  const outputTokens = Number(response.usage?.output_tokens || 0);
  const webSearchCalls = Array.isArray(response.output)
    ? response.output.filter((item: Record<string, unknown>) => item.type === "web_search_call").length
    : 0;
  const estimatedCostMicros = inputTokens * 1 + outputTokens * 6 + webSearchCalls * 10_000;
  await admin.from("ai_usage_events").insert({
    user_id: user.id,
    provider: "openai",
    model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    estimated_cost_micros: estimatedCostMicros
  });

  return json({ ok: true, guidance, restaurantPlan });
});
