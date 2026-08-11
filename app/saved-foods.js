import {
  deleteLocalSavedFood,
  getCachedSyncedFoods,
  getDeviceSavedFoods,
  getSavedFoodStorageMode,
  replaceSyncedFoodCache,
  requestPersistentDeviceStorage,
  saveDeviceFood,
  setSavedFoodStorageMode,
  updateSyncedFoodCache
} from "./saved-foods-store.js?v=20260811-1";
import {
  favoriteMealFromEstimate,
  favoriteMealNutritionFields,
  normalizeFavoriteComponents
} from "./favorite-meal.js?v=20260811-1";

const allowedPhotoTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const maxPhotoBytes = 8 * 1024 * 1024;
const numericFields = [
  "calories",
  "protein_g",
  "carbs_g",
  "net_carbs_g",
  "fat_g",
  "fiber_g",
  "sugar_alcohols_g",
  "allulose_g",
  "hydration_ounces"
];
const evidenceLabels = {
  nutrition_label: "Nutrition label values",
  restaurant_published: "Restaurant-published values",
  restaurant_estimate: "Restaurant meal estimate",
  mixed_estimate: "Label + estimated items",
  photo_estimate: "Photo estimate",
  description_estimate: "Description estimate",
  manual: "User-entered values"
};
const componentEvidenceLabels = {
  nutrition_label: "Label values",
  photo_estimate: "Estimated from photo",
  description_estimate: "Estimated from description"
};
const itemTypeLabels = {
  packaged_product: "Packaged product",
  home_meal: "Home or recurring meal",
  restaurant_item: "Restaurant item"
};

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;"
  })[character]);
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function formatNumber(value) {
  const rounded = Math.round(numberValue(value) * 10) / 10;
  return Number.isInteger(rounded) ? rounded.toLocaleString() : rounded.toFixed(1);
}

function normalizedSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\u2019']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function searchTokens(value) {
  const ignored = new Set(["a", "an", "the", "i", "ate", "had", "my", "for", "as", "snack", "breakfast", "brunch", "lunch", "dinner"]);
  return new Set(normalizedSearchText(value).split(" ").filter((token) => token.length > 1 && !ignored.has(token)));
}

function normalizedFood(food) {
  const componentFallback = food.evidence_type === "nutrition_label"
    ? "nutrition_label"
    : ["photo_estimate", "mixed_estimate"].includes(food.evidence_type)
      ? "photo_estimate"
      : "description_estimate";
  const normalized = {
    ...food,
    item_type: itemTypeLabels[food.item_type] ? food.item_type : "packaged_product",
    name: String(food.name || "Saved food").slice(0, 160),
    brand_or_restaurant: String(food.brand_or_restaurant || "").slice(0, 160),
    serving_description: String(food.serving_description || "1 serving").slice(0, 160),
    evidence_type: evidenceLabels[food.evidence_type] ? food.evidence_type : "manual",
    confidence: ["low", "medium", "high"].includes(food.confidence) ? food.confidence : "medium",
    notes: String(food.notes || "").slice(0, 1000),
    components: normalizeFavoriteComponents(food.components, componentFallback)
  };
  numericFields.forEach((field) => { normalized[field] = numberValue(food[field]); });
  return normalized;
}

export function findSavedFoodMatch(foods, description) {
  const query = normalizedSearchText(description);
  if (!query || query.length > 180 || /[,;+&]|\b(and|with|plus)\b/i.test(description)) return null;
  const queryTokens = searchTokens(query);
  if (!queryTokens.size) return null;
  if (queryTokens.size === 1) {
    const [onlyToken] = queryTokens;
    const tokenMatches = foods.filter((food) => searchTokens(`${food.brand_or_restaurant || ""} ${food.name || ""}`).has(onlyToken));
    if (tokenMatches.length > 1) return null;
  }
  const ranked = foods.map((food) => {
    const name = normalizedSearchText(food.name);
    const brand = normalizedSearchText(food.brand_or_restaurant);
    const candidate = [brand, name].filter(Boolean).join(" ");
    const candidateTokens = searchTokens(candidate);
    let score = 0;
    queryTokens.forEach((token) => { if (candidateTokens.has(token)) score += 4; });
    if (name && (query.includes(name) || name.includes(query))) score += 14;
    if (brand && query.includes(brand)) score += 9;
    if (candidate && query.includes(candidate)) score += 18;
    return { food, score };
  }).sort((a, b) => b.score - a.score);
  if (!ranked[0] || ranked[0].score < 4) return null;
  if (ranked[1] && ranked[1].score >= ranked[0].score - 1) return null;
  const quantity = Number(description.match(/^\s*(\d+(?:\.\d+)?)/)?.[1] || 1);
  return {
    food: ranked[0].food,
    servings: Math.max(0.1, Math.min(50, Number.isFinite(quantity) ? quantity : 1))
  };
}

function safePhotoPath(userId, path) {
  return typeof path === "string" && path.startsWith(`${userId}/`) && !path.includes("..");
}

async function functionErrorMessage(error, fallback) {
  try {
    if (error?.context && typeof error.context.json === "function") {
      const payload = await error.context.json();
      if (payload?.error) return payload.error;
    }
  } catch {
    // Fall through to the safe client message.
  }
  return error?.message || fallback;
}

export async function initializeSavedFoods({
  supabase,
  invokeAuthenticated,
  user,
  defaultMealLabel,
  toast,
  hasCurrentCoreMembership,
  showMembershipPrompt,
  onLedgerChange
}) {
  const root = document.querySelector("#saved-foods");
  if (!root) return;
  const $ = (selector) => document.querySelector(selector);
  const state = {
    foods: [],
    pendingFile: null,
    editingFood: null,
    reviewComponents: [],
    objectUrls: [],
    storageMode: getSavedFoodStorageMode(user.id)
  };

  function storageCopy(mode = state.storageMode) {
    if (mode === "device_only") {
      return "New items stay in Meal Daddy's private storage in this browser. They do not sync and can be lost if browser or app data is cleared.";
    }
    if (mode === "one_time") {
      return "The next scan can be logged once without creating a reusable product record. The temporary processing photo is deleted.";
    }
    return "New items sync to your protected Meal Daddy account and are cached on this device for speed and offline convenience.";
  }

  function setStorageMode(mode, persist = true) {
    state.storageMode = persist ? setSavedFoodStorageMode(user.id, mode) : mode;
    document.querySelectorAll('input[name="saved_food_default_storage"]').forEach((input) => {
      input.checked = input.value === state.storageMode;
    });
    $("#saved-food-storage-copy").textContent = storageCopy();
  }

  function releaseObjectUrls() {
    state.objectUrls.forEach((url) => URL.revokeObjectURL(url));
    state.objectUrls = [];
  }

  function foodSubtitle(food) {
    return [food.brand_or_restaurant, food.serving_description].filter(Boolean).join(" · ");
  }

  function foodNutritionLine(food) {
    return `${formatNumber(food.calories)} cal · ${formatNumber(food.protein_g)}g protein · ${formatNumber(food.carbs_g)}g/${formatNumber(food.net_carbs_g)}g total/net carbs · ${formatNumber(food.fat_g)}g fat`;
  }

  function findBestMatch(description) {
    const match = findSavedFoodMatch(state.foods, description);
    if (!match) return null;
    return {
      ...match,
      nutritionLine: foodNutritionLine(match.food),
      subtitle: foodSubtitle(match.food)
    };
  }

  function reviewDetectedFood(food, photoFile = null) {
    const candidate = normalizedFood({
      ...food,
      item_type: "packaged_product",
      evidence_type: "nutrition_label"
    });
    const existing = state.foods.find((savedFood) =>
      normalizedSearchText(savedFood.name) === normalizedSearchText(candidate.name) &&
      normalizedSearchText(savedFood.brand_or_restaurant) === normalizedSearchText(candidate.brand_or_restaurant)
    ) || null;
    state.pendingFile = photoFile;
    state.editingFood = existing;
    populateReview(candidate, existing);
    $("#saved-food-editor-title").textContent = existing ? "Review updated label" : "Review label before saving";
    $("#saved-food-photo-name").textContent = photoFile ? `${photoFile.name || "Label photo"} ready` : "Label values ready for review.";
    openEditor();
  }

  function reviewRestaurantFood(food) {
    const candidate = normalizedFood({
      ...food,
      item_type: "restaurant_item",
      evidence_type: food.evidence_type === "restaurant_published" ? "restaurant_published" : "restaurant_estimate"
    });
    const existing = state.foods.find((savedFood) =>
      savedFood.item_type === "restaurant_item" &&
      normalizedSearchText(savedFood.name) === normalizedSearchText(candidate.name) &&
      normalizedSearchText(savedFood.brand_or_restaurant) === normalizedSearchText(candidate.brand_or_restaurant)
    ) || null;
    state.pendingFile = null;
    state.editingFood = existing;
    populateReview(candidate, existing);
    $("#saved-food-editor-title").textContent = existing ? "Review updated favorite meal" : "Review favorite restaurant meal";
    $("#saved-food-photo-name").textContent = "Customized restaurant order ready for review.";
    openEditor();
  }

  function reviewEstimatedMeal({ description, mealLabel, estimate }, photoFile = null) {
    const candidate = normalizedFood(favoriteMealFromEstimate({ description, mealLabel, estimate }));
    const existing = state.foods.find((savedFood) =>
      savedFood.item_type === "home_meal" &&
      normalizedSearchText(savedFood.name) === normalizedSearchText(candidate.name)
    ) || null;
    state.pendingFile = photoFile;
    state.editingFood = existing;
    populateReview(candidate, existing);
    $("#saved-food-editor-title").textContent = existing ? "Review updated Favorite Meal" : "Review Favorite Meal";
    $("#saved-food-photo-name").textContent = photoFile
      ? `${photoFile.name || "Meal photo"} ready as an optional private reference.`
      : "Photo and description estimates are ready for review.";
    openEditor();
  }

  function componentEvidenceDetails(food) {
    if (!food.components.length) return "";
    return `<details class="saved-food-evidence">
      <summary>How values were calculated</summary>
      <ul>${food.components.map((component) => `<li><span>${escapeHtml(component.name)}</span><span>${escapeHtml(componentEvidenceLabels[component.evidence_type] || "Estimated")}</span></li>`).join("")}</ul>
    </details>`;
  }

  function foodCard(food) {
    const photo = food.photo_path || food.photo_blob
      ? `<div class="saved-food-photo"><span>${escapeHtml(food.name).charAt(0).toUpperCase()}</span><img data-saved-food-photo="${escapeHtml(food.storage_scope)}:${escapeHtml(food.id)}" alt="Saved reference for ${escapeHtml(food.name)}" hidden /></div>`
      : `<div class="saved-food-photo saved-food-photo-placeholder" aria-hidden="true"><span>${escapeHtml(food.name).charAt(0).toUpperCase()}</span></div>`;
    const defaultLabel = defaultMealLabel();
    return `<article class="saved-food-item" data-saved-food="${escapeHtml(food.storage_scope)}:${escapeHtml(food.id)}">
      ${photo}
      <div class="saved-food-main">
        <div class="saved-food-badges"><span>${escapeHtml(itemTypeLabels[food.item_type])}</span><span class="evidence-${escapeHtml(food.evidence_type)}">${escapeHtml(evidenceLabels[food.evidence_type])}</span><span>${food.storage_scope === "device" ? "This device only" : "Private sync"}</span></div>
        <h3>${escapeHtml(food.name)}</h3>
        <p>${escapeHtml(foodSubtitle(food))}</p>
        <strong>${escapeHtml(foodNutritionLine(food))}</strong>
        ${componentEvidenceDetails(food)}
        ${food.evidence_type === "mixed_estimate" ? `<small>Readable label values were used where available; the remaining items are estimates.</small>` : ""}
        ${food.evidence_type === "photo_estimate" ? `<small>Estimated from a photo; review portions when they change.</small>` : ""}
        ${food.evidence_type === "description_estimate" ? `<small>Estimated from your description; review portions when they change.</small>` : ""}
        ${food.evidence_type === "restaurant_estimate" ? `<small>Restaurant meal estimate; published values were not confirmed.</small>` : ""}
      </div>
      <form class="saved-food-log-form" data-log-saved-food="${escapeHtml(food.storage_scope)}:${escapeHtml(food.id)}">
        <label><span>Servings</span><input name="servings" type="number" min="0.1" max="50" step="0.1" value="1" inputmode="decimal" required /></label>
        <label><span>Log as</span><select name="meal_label">${["Breakfast", "Brunch", "Lunch", "Dinner", "Snack"].map((label) => `<option${label === defaultLabel ? " selected" : ""}>${label}</option>`).join("")}</select></label>
        <button class="button button-primary" type="submit">Log</button>
      </form>
      <div class="saved-food-item-actions"><button type="button" data-edit-saved-food="${escapeHtml(food.storage_scope)}:${escapeHtml(food.id)}">Edit</button><button type="button" data-delete-saved-food="${escapeHtml(food.storage_scope)}:${escapeHtml(food.id)}">Delete</button></div>
    </article>`;
  }

  async function hydrateFoodPhotos() {
    for (const food of state.foods) {
      const image = document.querySelector(`[data-saved-food-photo="${CSS.escape(`${food.storage_scope}:${food.id}`)}"]`);
      if (!image) continue;
      try {
        let url = "";
        if (food.storage_scope === "device" && food.photo_blob instanceof Blob) {
          url = URL.createObjectURL(food.photo_blob);
          state.objectUrls.push(url);
        } else if (food.storage_scope === "sync" && safePhotoPath(user.id, food.photo_path)) {
          const { data, error } = await supabase.storage
            .from("saved-food-photos")
            .createSignedUrl(food.photo_path, 3600);
          if (error) throw error;
          url = data?.signedUrl || "";
        }
        if (url) {
          image.src = url;
          image.hidden = false;
          image.previousElementSibling.hidden = true;
        }
      } catch {
        // A missing thumbnail never prevents the structured saved food from being used.
      }
    }
  }

  function renderFoods() {
    releaseObjectUrls();
    const list = $("#saved-foods-list");
    const count = $("#saved-food-count");
    if (count) {
      count.textContent = state.foods.length === 1
        ? "1 saved food"
        : `${state.foods.length} saved foods`;
    }
    if (!state.foods.length) {
      list.innerHTML = '<p class="saved-foods-empty">No saved foods yet. Photograph a label, recurring meal, or restaurant item and Meal Daddy will help you review it.</p>';
      return;
    }
    list.innerHTML = state.foods.map(foodCard).join("");
    void hydrateFoodPhotos();
  }

  async function loadFoods() {
    let syncedFoods = [];
    try {
      const { data, error } = await supabase
        .from("saved_foods")
        .select("*")
        .eq("user_id", user.id)
        .order("last_used_at", { ascending: false, nullsFirst: false })
        .order("updated_at", { ascending: false });
      if (error) throw error;
      syncedFoods = (data || []).map((food) => normalizedFood({ ...food, storage_scope: "sync" }));
      await replaceSyncedFoodCache(user.id, syncedFoods).catch(() => {});
    } catch (error) {
      syncedFoods = (await getCachedSyncedFoods(user.id).catch(() => []))
        .map((food) => normalizedFood({ ...food, storage_scope: "sync" }));
      $("#saved-foods-status").textContent = syncedFoods.length
        ? "Showing the protected copy cached on this device. Account sync will retry when the connection returns."
        : "My Foods account sync is temporarily unavailable. Device-only foods remain available in this browser.";
    }
    const deviceFoods = (await getDeviceSavedFoods(user.id).catch(() => []))
      .map((food) => normalizedFood({ ...food, storage_scope: "device" }));
    state.foods = [...syncedFoods, ...deviceFoods].sort((a, b) => {
      const aDate = new Date(a.last_used_at || a.updated_at || a.created_at || 0).valueOf();
      const bDate = new Date(b.last_used_at || b.updated_at || b.created_at || 0).valueOf();
      return bDate - aDate;
    });
    renderFoods();
  }

  function foodByKey(key) {
    const divider = key.indexOf(":");
    const scope = key.slice(0, divider);
    const id = key.slice(divider + 1);
    return state.foods.find((food) => food.storage_scope === scope && food.id === id);
  }

  function openEditor() {
    $("#saved-food-editor").hidden = false;
    document.body.classList.add("modal-open");
    $("#saved-food-editor-panel").focus();
  }

  function closeEditor() {
    $("#saved-food-editor").hidden = true;
    document.body.classList.remove("modal-open");
    state.pendingFile = null;
    state.editingFood = null;
    state.reviewComponents = [];
    $("#saved-food-photo-input").value = "";
    $("#saved-food-scan-status").textContent = "";
  }

  function showCaptureStep() {
    state.pendingFile = null;
    state.editingFood = null;
    state.reviewComponents = [];
    $("#saved-food-scan-form").reset();
    $("#saved-food-capture-step").hidden = false;
    $("#saved-food-review-step").hidden = true;
    $("#saved-food-photo-name").textContent = "No photo selected.";
    $("#saved-food-editor-title").textContent = "Add to My Foods";
    openEditor();
  }

  function setReviewField(name, value) {
    const field = $("#saved-food-review-form").elements.namedItem(name);
    if (field) field.value = value ?? "";
  }

  function selectedStorageMode() {
    return document.querySelector('input[name="saved_food_storage"]:checked')?.value || state.storageMode;
  }

  function updateReviewStorageCopy() {
    const mode = selectedStorageMode();
    $("#saved-food-review-storage-copy").textContent = storageCopy(mode);
    const keepPhoto = $("#saved-food-keep-photo");
    keepPhoto.disabled = mode === "one_time" || (!state.pendingFile && !state.editingFood?.photo_path && !state.editingFood?.photo_blob);
    if (mode === "one_time") keepPhoto.checked = false;
    $("#save-saved-food").textContent = mode === "one_time" ? "Log once" : state.editingFood ? "Save changes" : "Save to My Foods";
  }

  function populateReview(food, editingFood = null) {
    const normalized = normalizedFood(food);
    state.editingFood = editingFood;
    state.reviewComponents = normalized.components;
    setReviewField("item_type", normalized.item_type);
    setReviewField("name", normalized.name);
    setReviewField("brand_or_restaurant", normalized.brand_or_restaurant);
    setReviewField("serving_description", normalized.serving_description);
    numericFields.forEach((field) => setReviewField(field, normalized[field]));
    setReviewField("evidence_type", normalized.evidence_type);
    setReviewField("confidence", normalized.confidence);
    setReviewField("notes", normalized.notes);
    $("#saved-food-review-source").textContent = evidenceLabels[normalized.evidence_type];
    $("#saved-food-capture-step").hidden = true;
    $("#saved-food-review-step").hidden = false;
    $("#saved-food-editor-title").textContent = editingFood ? "Edit saved food" : "Review before saving";

    const fixedScope = editingFood?.storage_scope === "device" ? "device_only" : editingFood ? "sync_cache" : null;
    const mode = fixedScope || state.storageMode;
    document.querySelectorAll('input[name="saved_food_storage"]').forEach((input) => {
      input.checked = input.value === mode;
      input.disabled = Boolean(fixedScope);
    });
    $("#saved-food-storage-legend").textContent = fixedScope ? "Current storage location" : "Where should Meal Daddy remember this?";
    $("#saved-food-keep-photo").checked = Boolean(editingFood?.photo_path || editingFood?.photo_blob);
    updateReviewStorageCopy();
  }

  function blankFood(itemType) {
    return normalizedFood({
      item_type: itemType,
      name: "",
      serving_description: "1 serving",
      evidence_type: "manual",
      confidence: "high"
    });
  }

  function reviewFormFood() {
    const formData = new FormData($("#saved-food-review-form"));
    const food = {
      item_type: String(formData.get("item_type") || "packaged_product"),
      name: String(formData.get("name") || "").trim(),
      brand_or_restaurant: String(formData.get("brand_or_restaurant") || "").trim(),
      serving_description: String(formData.get("serving_description") || "1 serving").trim(),
      evidence_type: String(formData.get("evidence_type") || "manual"),
      confidence: String(formData.get("confidence") || "medium"),
      notes: String(formData.get("notes") || "").trim(),
      components: state.reviewComponents
    };
    numericFields.forEach((field) => { food[field] = numberValue(formData.get(field)); });
    return normalizedFood(food);
  }

  async function uploadRetainedPhoto(file) {
    if (!file) return null;
    const extension = file.name.includes(".") ? file.name.split(".").pop().replace(/[^a-z0-9]/gi, "") : "jpg";
    const path = `${user.id}/${crypto.randomUUID()}.${extension || "jpg"}`;
    const { error } = await supabase.storage
      .from("saved-food-photos")
      .upload(path, file, { upsert: false, contentType: file.type });
    if (error) throw error;
    return path;
  }

  async function removeRetainedPhoto(path) {
    if (!safePhotoPath(user.id, path)) return;
    const { error } = await supabase.storage.from("saved-food-photos").remove([path]);
    if (error) throw error;
  }

  async function saveReviewedFood(food, mode, keepPhoto) {
    const editing = state.editingFood;
    if (mode === "sync_cache") {
      const priorPhotoPath = editing?.photo_path || null;
      const uploadedPhotoPath = keepPhoto && state.pendingFile
        ? await uploadRetainedPhoto(state.pendingFile)
        : null;
      const photoPath = keepPhoto ? uploadedPhotoPath || priorPhotoPath : null;
      const payload = {
        ...food,
        user_id: user.id,
        photo_path: photoPath,
        last_verified_on: new Date().toISOString().slice(0, 10),
        updated_at: new Date().toISOString()
      };
      let query = editing
        ? supabase.from("saved_foods").update(payload).eq("id", editing.id).eq("user_id", user.id)
        : supabase.from("saved_foods").insert(payload);
      const { data, error } = await query.select("*").single();
      if (error) {
        if (uploadedPhotoPath) await removeRetainedPhoto(uploadedPhotoPath).catch(() => {});
        throw error;
      }
      if (priorPhotoPath && priorPhotoPath !== photoPath) {
        await removeRetainedPhoto(priorPhotoPath).catch(() => {});
      }
      await updateSyncedFoodCache(user.id, normalizedFood({ ...data, storage_scope: "sync" })).catch(() => {});
      return data;
    }

    const photoBlob = keepPhoto ? state.pendingFile || editing?.photo_blob || null : null;
    return saveDeviceFood(user.id, {
      ...editing,
      ...food,
      photo_blob: photoBlob,
      photo_path: null,
      storage_scope: "device",
      last_verified_on: new Date().toISOString().slice(0, 10),
      use_count: Number(editing?.use_count || 0)
    });
  }

  async function logFood(food, servings, mealLabel, occurredAt = new Date().toISOString(), occurredLabel = "today") {
    const multiplier = Math.max(0.1, Math.min(50, numberValue(servings) || 1));
    const totals = {};
    numericFields.forEach((field) => { totals[field] = Math.round(numberValue(food[field]) * multiplier * 10) / 10; });
    const servingText = multiplier === 1 ? food.serving_description : `${formatNumber(multiplier)} × ${food.serving_description}`;
    const description = [food.name, food.brand_or_restaurant ? `(${food.brand_or_restaurant})` : "", `— ${servingText}`].filter(Boolean).join(" ");
    const componentSource = food.components?.length ? food.components : [{
      name: food.name,
      calories: food.calories,
      protein_g: food.protein_g,
      carbs_g: food.carbs_g,
      net_carbs_g: food.net_carbs_g,
      fat_g: food.fat_g,
      fiber_g: food.fiber_g,
      hydration_ounces: food.hydration_ounces,
      evidence_type: food.evidence_type === "nutrition_label" ? "nutrition_label" : "description_estimate",
      confidence: food.confidence
    }];
    const scaledComponents = componentSource.map((component) => {
      const scaled = {
        name: component.name,
        evidence_type: component.evidence_type,
        confidence: component.confidence
      };
      favoriteMealNutritionFields.forEach((field) => {
        scaled[field] = Math.round(numberValue(component[field]) * multiplier * 10) / 10;
      });
      return scaled;
    });
    const nutrition = {
      calories: totals.calories,
      protein_g: totals.protein_g,
      carbs_g: totals.carbs_g,
      net_carbs_g: totals.net_carbs_g,
      fat_g: totals.fat_g,
      fiber_g: totals.fiber_g,
      hydration_ounces: totals.hydration_ounces,
      confidence: food.confidence,
      note: `${evidenceLabels[food.evidence_type]} reviewed by the user; ${servingText}.`,
      source: "saved_food",
      saved_food_id: food.storage_scope === "sync" ? food.id : null,
      components: scaledComponents
    };
    const { error } = await supabase.from("ledger_entries").insert({
      user_id: user.id,
      client_request_id: crypto.randomUUID(),
      kind: "meal",
      occurred_at: occurredAt,
      description,
      meal_label: mealLabel,
      nutrition_estimate: nutrition,
      status: "estimated"
    });
    if (error) throw error;

    const lastUsedAt = new Date().toISOString();
    if (food.storage_scope === "sync") {
      const useCount = Number(food.use_count || 0) + 1;
      await supabase
        .from("saved_foods")
        .update({ use_count: useCount, last_used_at: lastUsedAt, updated_at: lastUsedAt })
        .eq("id", food.id)
        .eq("user_id", user.id);
    } else if (food.storage_scope === "device") {
      await saveDeviceFood(user.id, {
        ...food,
        use_count: Number(food.use_count || 0) + 1,
        last_used_at: lastUsedAt
      });
    }
    await onLedgerChange();
    await loadFoods();
    toast(`${food.name} logged for ${occurredLabel} from My Foods—no new AI request needed.`);
  }

  $("#add-saved-food").addEventListener("click", showCaptureStep);
  $("#close-saved-food-editor").addEventListener("click", closeEditor);
  $("#saved-food-editor-backdrop").addEventListener("click", closeEditor);
  $("#saved-food-photo-input").addEventListener("change", (event) => {
    state.pendingFile = event.target.files[0] || null;
    $("#saved-food-photo-name").textContent = state.pendingFile ? `${state.pendingFile.name} ready` : "No photo selected.";
  });
  $("#saved-food-enter-manually").addEventListener("click", () => {
    const itemType = document.querySelector('input[name="saved_food_item_type"]:checked')?.value || "packaged_product";
    state.pendingFile = null;
    populateReview(blankFood(itemType));
  });
  $("#saved-food-back-to-photo").addEventListener("click", () => {
    $("#saved-food-capture-step").hidden = false;
    $("#saved-food-review-step").hidden = true;
    state.editingFood = null;
  });

  $("#saved-food-scan-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = $("#saved-food-scan-status");
    const button = $("#analyze-saved-food-photo");
    const file = state.pendingFile;
    if (!file) {
      status.textContent = "Take or choose a photo first.";
      return;
    }
    if (!allowedPhotoTypes.has(file.type.toLowerCase()) || file.size > maxPhotoBytes) {
      status.textContent = "Use a JPG, PNG, WebP, or GIF photo no larger than 8 MB.";
      return;
    }
    if (!hasCurrentCoreMembership()) {
      showMembershipPrompt("Food photo", "ready to scan");
      status.textContent = "Photo analysis is available with Meal Daddy Core.";
      return;
    }

    button.disabled = true;
    status.textContent = "Reading the photo. This usually takes only a few seconds...";
    const safeName = file.name.replace(/[^a-z0-9._-]/gi, "-");
    const photoPath = `${user.id}/food-scan-${crypto.randomUUID()}-${safeName}`;
    try {
      const { error: uploadError } = await supabase.storage
        .from("meal-photos")
        .upload(photoPath, file, { upsert: false, contentType: file.type });
      if (uploadError) throw uploadError;
      const itemType = document.querySelector('input[name="saved_food_item_type"]:checked')?.value || "packaged_product";
      const context = $("#saved-food-photo-context").value.trim();
      const { data, error } = await invokeAuthenticated("analyze-saved-food", {
        body: { photoPath, itemType, context }
      });
      if (error) throw error;
      if (!data?.food) throw new Error("Meal Daddy did not return food information.");
      populateReview(data.food);
      status.textContent = "";
    } catch (error) {
      status.textContent = await functionErrorMessage(error, "The photo could not be analyzed. Please try again.");
    } finally {
      await supabase.storage.from("meal-photos").remove([photoPath]).catch(() => {});
      button.disabled = false;
    }
  });

  $("#saved-food-review-form").addEventListener("change", (event) => {
    if (event.target.name === "saved_food_storage") updateReviewStorageCopy();
    if (event.target.name === "evidence_type") {
      $("#saved-food-review-source").textContent = evidenceLabels[event.target.value] || "Reviewed values";
    }
  });

  $("#saved-food-review-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = $("#saved-food-review-status");
    const button = $("#save-saved-food");
    const food = reviewFormFood();
    if (!food.name || !food.serving_description) {
      status.textContent = "Add a name and serving description before saving.";
      return;
    }
    const mode = state.editingFood
      ? state.editingFood.storage_scope === "device" ? "device_only" : "sync_cache"
      : selectedStorageMode();
    const keepPhoto = $("#saved-food-keep-photo").checked;
    button.disabled = true;
    status.textContent = mode === "one_time" ? "Logging the reviewed values..." : "Saving your reviewed food...";
    try {
      if (mode === "one_time") {
        await logFood({ ...food, storage_scope: "one_time" }, 1, defaultMealLabel());
        closeEditor();
        return;
      }
      if (!state.editingFood) setStorageMode(mode);
      await saveReviewedFood(food, mode, keepPhoto);
      if (mode === "device_only") {
        const persistence = await requestPersistentDeviceStorage();
        $("#saved-foods-status").textContent = persistence.persistent
          ? "This browser granted persistent storage. Device-only records remain until you remove them or clear the app's data."
          : "This browser did not guarantee persistent storage. Export device-only foods if you need a backup.";
      } else {
        $("#saved-foods-status").textContent = "Saved to your protected account and cached on this device.";
      }
      await loadFoods();
      closeEditor();
      toast(`${food.name} saved to My Foods.`);
    } catch (error) {
      status.textContent = error.message || "The saved food could not be stored.";
    } finally {
      button.disabled = false;
    }
  });

  $("#saved-foods-list").addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-log-saved-food]");
    if (!form) return;
    event.preventDefault();
    const food = foodByKey(form.dataset.logSavedFood);
    if (!food) return;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const formData = new FormData(form);
      await logFood(food, formData.get("servings"), String(formData.get("meal_label") || defaultMealLabel()));
    } catch (error) {
      toast(error.message || "That saved food could not be logged.");
      button.disabled = false;
    }
  });

  $("#saved-foods-list").addEventListener("click", async (event) => {
    const editButton = event.target.closest("[data-edit-saved-food]");
    const deleteButton = event.target.closest("[data-delete-saved-food]");
    if (editButton) {
      const food = foodByKey(editButton.dataset.editSavedFood);
      if (!food) return;
      state.pendingFile = null;
      populateReview(food, food);
      openEditor();
    }
    if (deleteButton) {
      const food = foodByKey(deleteButton.dataset.deleteSavedFood);
      if (!food || !window.confirm(`Delete “${food.name}” from My Foods? Existing meal history will stay unchanged.`)) return;
      deleteButton.disabled = true;
      try {
        if (food.storage_scope === "sync") {
          if (food.photo_path) await removeRetainedPhoto(food.photo_path);
          const { error } = await supabase
            .from("saved_foods")
            .delete()
            .eq("id", food.id)
            .eq("user_id", user.id);
          if (error) throw error;
          await deleteLocalSavedFood(user.id, "sync", food.id).catch(() => {});
        } else {
          await deleteLocalSavedFood(user.id, "device", food.id);
        }
        await loadFoods();
        toast(`${food.name} removed from My Foods.`);
      } catch (error) {
        toast(error.message || "The saved food could not be deleted.");
        deleteButton.disabled = false;
      }
    }
  });

  document.querySelectorAll('input[name="saved_food_default_storage"]').forEach((input) => {
    input.addEventListener("change", async () => {
      setStorageMode(input.value);
      if (input.value === "device_only") {
        const persistence = await requestPersistentDeviceStorage();
        $("#saved-foods-status").textContent = persistence.persistent
          ? "This browser granted persistent storage for device-only records."
          : "This browser may remove device-only data under storage pressure. Private account sync is safer for important records.";
      } else {
        $("#saved-foods-status").textContent = "Storage preference updated for future saved foods on this device.";
      }
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !$("#saved-food-editor").hidden) closeEditor();
  });

  setStorageMode(state.storageMode, false);
  await loadFoods();
  return {
    findBestMatch,
    logFood,
    reviewDetectedFood,
    reviewEstimatedMeal,
    reviewRestaurantFood,
    refresh: loadFoods
  };
}
