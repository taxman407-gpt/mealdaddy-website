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
    : "Give concise restaurant ordering guidance. Recommend one or two practical choices, useful modifications, and a simple ordering script when helpful. If the exact menu is unknown, state that and give reliable category-level guidance.";
  const nutritionGuardrail = nutritionContext?.netCarbGoal
    ? `The user's saved hard daily net-carb ceiling is ${nutritionContext.netCarbGoal}g. They have logged approximately ${nutritionContext.netCarbs}g today, leaving ${Math.max(0, nutritionContext.netCarbGoal - nutritionContext.netCarbs)}g. Treat the remaining allowance as a hard constraint whenever possible. Estimate net carbs for each recommendation and show projected daily net carbs. Never recommend an option over the ceiling if a lower-carb option can meet the request. If the user is already at or over the ceiling, choose options with as close to zero additional net carbs as practical and say so clearly.`
    : "Treat any explicit numeric nutrition limit in the user's request as a hard constraint unless safety requires otherwise.";

  const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${openAiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      store: false,
      reasoning: { effort: "none" },
      max_output_tokens: 450,
      input: [
        {
          role: "system",
          content: [{
            type: "input_text",
            text: `You are Meal Daddy, a practical nutrition and meal-planning coach. ${task} ${nutritionGuardrail} Respect listed allergies, restrictions, preferences, budget, and household needs. Do not diagnose, prescribe, or replace medical advice. Use a supportive, direct tone and return plain text under 220 words.`
          }]
        },
        {
          role: "user",
          content: [{
            type: "input_text",
            text: `Saved profile:\n${JSON.stringify(profileContext(profile))}\n\nToday's nutrition context:\n${JSON.stringify(nutritionContext)}\n\nUser request:\n${context}`
          }]
        }
      ],
      text: { verbosity: "low" }
    })
  });

  if (!openAiResponse.ok) {
    const errorBody = await openAiResponse.json().catch(() => ({}));
    return json({
      error: "Meal Daddy could not generate guidance right now.",
      code: errorBody?.error?.code ?? errorBody?.error?.type ?? ""
    }, 502);
  }

  const response = await openAiResponse.json();
  const guidance = outputText(response).trim();
  if (!guidance) return json({ error: "Meal Daddy returned an empty response." }, 502);

  const inputTokens = Number(response.usage?.input_tokens || 0);
  const outputTokens = Number(response.usage?.output_tokens || 0);
  const estimatedCostMicros = inputTokens * 1 + outputTokens * 6;
  await admin.from("ai_usage_events").insert({
    user_id: user.id,
    provider: "openai",
    model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    estimated_cost_micros: estimatedCostMicros
  });

  return json({ ok: true, guidance });
});
