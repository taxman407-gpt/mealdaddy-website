/**
 * Quick Log feedback and estimate-response validation.
 * The existing logger remains the only writer of meals and photos. This module
 * observes its lifecycle; it never creates, retries, deletes, or changes entries.
 */
const lifecycle = new EventTarget();
let requestSequence = 0;
let mounted = null;
const nutritionFields = ["calories", "protein_g", "carbs_g", "net_carbs_g", "fat_g", "fiber_g"];

export function validateEstimateResponse(data, { requireComponents = false } = {}) {
  const estimate = data?.estimate;
  const validNumber = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
  if (data?.ok !== true || !estimate || typeof estimate !== "object" ||
      nutritionFields.some((field) => !validNumber(estimate[field]))) {
    throw new Error("The analysis did not return a usable nutrition estimate. Review the saved entry before retrying.");
  }
  if (requireComponents && (!Array.isArray(estimate.components) || !estimate.components.length ||
      estimate.components.some((item) => !item || typeof item.name !== "string" || !item.name.trim() ||
        nutritionFields.some((field) => !validNumber(item[field]))))) {
    throw new Error("The photo did not return a usable food breakdown. Open the saved entry to add details or retry its analysis.");
  }
  return estimate;
}

export function withDeadline(task, milliseconds, message) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(message);
      error.name = "TimeoutError";
      reject(error);
    }, milliseconds);
  });
  // A deadline ends this browser wait, not the server's work. Never auto-retry.
  return Promise.race([Promise.resolve(task), deadline]).finally(() => clearTimeout(timer));
}

export async function readableFailure(error, fallback = "The request could not be completed.") {
  try {
    if (typeof error?.context?.clone === "function") {
      const payload = await error.context.clone().json();
      if (typeof payload?.error === "string" && payload.error.trim()) return payload.error.slice(0, 600);
    }
  } catch { /* Keep the original error when the response is not JSON. */ }
  return typeof error?.message === "string" && error.message.trim() ? error.message.slice(0, 600) : fallback;
}

export function photoValidationMessage(file) {
  if (!file) return "";
  const type = String(file.type || "").toLowerCase();
  if (/heic|heif/.test(type) || /\.(heic|heif)$/i.test(file.name || "")) {
    return "This HEIC/HEIF photo is not supported here. Choose a JPG/PNG copy or a screenshot, or describe the meal instead.";
  }
  if (!new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]).has(type)) {
    return "Use a JPG, PNG, WebP, or GIF photo, or describe the meal instead.";
  }
  if (file.size > 8 * 1024 * 1024) return "Use a photo no larger than 8 MB, or describe the meal instead.";
  return "";
}

function emit(detail) {
  lifecycle.dispatchEvent(new CustomEvent("estimate", { detail }));
}

export async function observeEstimateRequest(task, body = {}, { timeoutMs = 90_000 } = {}) {
  const quickLog = typeof body?.saveFavorite === "boolean" && body.itemizeExisting !== true;
  const id = ++requestSequence;
  const context = { id, quickLog, entryId: typeof body?.entryId === "string" ? body.entryId : "" };
  const expectPhoto = quickLog && mounted?.hasSubmittedPhoto() === true;
  emit({ ...context, phase: "start" });
  let result;
  try {
    result = await withDeadline(Promise.resolve().then(task), timeoutMs,
      "Analysis is taking longer than expected and may still finish. Your entry is saved. Check Entries before retrying; do not log the meal again.");
    if (result?.error) throw result.error;
    const estimate = result?.data?.estimate;
    validateEstimateResponse(result?.data, {
      requireComponents: expectPhoto || typeof estimate?.photo_path === "string" || /photo/.test(String(estimate?.source || ""))
    });
    emit({ ...context, phase: "success", data: result.data });
    return result;
  } catch (error) {
    const message = await readableFailure(error);
    emit({ ...context, phase: "error", message });
    return { data: result?.data ?? null, error: error || new Error(message) };
  }
}

export function initializeEntryFeedback() {
  if (mounted || typeof document === "undefined") return mounted;
  const form = document.querySelector("#entry-form");
  const input = document.querySelector("#quick-entry");
  const photo = document.querySelector("#photo-input");
  const logButton = document.querySelector("#log-entry");
  if (!form || !input || !photo || !logButton) return null;

  const style = document.createElement("link");
  style.rel = "stylesheet";
  style.href = new URL("./entry-reliability.css?v=20261016-1", import.meta.url).href;
  document.head.append(style);

  const panel = document.createElement("section");
  panel.id = "quick-log-feedback";
  panel.className = "quick-log-feedback";
  panel.hidden = true;
  panel.setAttribute("aria-label", "Meal logging result");
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");
  const details = document.createElement("div");
  const review = document.createElement("a");
  review.className = "button";
  review.href = "./app.html?view=entries";
  review.textContent = "Review Entries / edit the saved meal";
  review.hidden = true;
  const fallback = document.createElement("button");
  fallback.type = "button";
  fallback.className = "button button-quiet";
  fallback.textContent = "Use a written description instead";
  fallback.hidden = true;
  panel.append(status, details, review, fallback);
  form.after(panel);
  let submission = null;
  const format = (number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(number);

  function show(message, phase = "info", { canReview = false, canDescribe = false } = {}) {
    panel.hidden = false;
    panel.dataset.phase = phase;
    status.textContent = message;
    details.replaceChildren();
    review.hidden = !canReview;
    fallback.hidden = !canDescribe;
    fallback.disabled = Boolean(submission?.busy);
  }

  function renderResult(data) {
    const estimate = validateEstimateResponse(data, { requireComponents: Boolean(submission?.hasPhoto) });
    show("Nutrition estimate ready. Review the identified foods below.", "success", { canReview: true });
    const heading = document.createElement("h3");
    heading.textContent = String(data.entryDescription || submission?.description || "Meal estimate");
    const totals = document.createElement("p");
    totals.textContent = `${format(estimate.calories)} cal · ${format(estimate.protein_g)} g protein · ${format(estimate.carbs_g)} g total carbs · ${format(estimate.fiber_g)} g fiber · ${format(estimate.net_carbs_g)} g net carbs · ${format(estimate.fat_g)} g fat`;
    details.append(heading, totals);
    if (Array.isArray(estimate.components)) {
      const list = document.createElement("ul");
      for (const item of estimate.components.slice(0, 40)) {
        const line = document.createElement("li");
        const calories = typeof item?.calories === "number" && Number.isFinite(item.calories) ? ` — ${format(item.calories)} cal` : "";
        line.textContent = `${String(item?.name || "Food item")}${calories}`;
        list.append(line);
      }
      details.append(list);
    }
    const note = document.createElement("p");
    note.textContent = [...new Set([estimate.note, data.descriptionReconciliationNote,
      "Portions and nutrition are estimates. Check the identified foods and edit the saved entry when needed."].filter(Boolean))].join(" ");
    details.append(note);
  }

  function release(record) {
    if (submission !== record) return;
    clearTimeout(record.timer);
    record.busy = false;
    for (const [control, wasDisabled] of record.controls) control.disabled = wasDisabled;
    record.controls = [];
    fallback.disabled = false;
  }

  fallback.addEventListener("click", () => {
    if (submission?.busy) return;
    photo.value = "";
    photo.dispatchEvent(new Event("change", { bubbles: true }));
    input.focus();
    show("Describe the foods and portions, then select Log. Check Entries first if an earlier attempt may have saved the meal.");
  });

  photo.addEventListener("change", () => {
    if (submission?.busy) return;
    const file = photo.files?.[0];
    const problem = photoValidationMessage(file);
    show(problem || (file
      ? "Photo selected. Add any portion or ingredient details, then select Log to analyze it."
      : "No photo selected. You can describe the meal instead."), problem ? "error" : "info", { canDescribe: Boolean(problem) });
  }, true);

  form.addEventListener("submit", (event) => {
    const stop = () => { event.preventDefault(); event.stopImmediatePropagation(); };
    if (submission?.busy) { stop(); return; }
    const file = photo.files?.[0] || null;
    if (!input.value.trim() && !file) {
      stop(); show("Add a meal description or choose a photo before selecting Log.", "error"); input.focus(); return;
    }
    const problem = photoValidationMessage(file);
    if (problem) { stop(); show(problem, "error", { canDescribe: true }); return; }
    if (file && document.querySelector("#meal-label")?.value === "Hydration") {
      stop(); show("Choose a meal or snack category for photo analysis. For hydration-only logging, remove the photo and enter the drink amount.", "error", { canDescribe: true }); return;
    }
    const record = { busy: true, hasPhoto: Boolean(file), description: input.value.trim(), requestId: null,
      entryId: "", phase: "preparing", latestNotice: "", controls: [], timer: null };
    submission = record;
    show(file ? "Preparing and uploading your private photo…" : "Saving your entry…", "loading");
    setTimeout(() => {
      if (submission !== record || !record.busy) return;
      // The legacy logger may pause for a saved-food choice or input validation.
      if (!logButton.disabled) { release(record); panel.hidden = true; return; }
      for (const control of form.querySelectorAll("input, select, textarea")) {
        record.controls.push([control, control.disabled]);
        control.disabled = true;
      }
      record.timer = setTimeout(() => {
        if (submission !== record || !record.busy || record.requestId !== null) return;
        show("This is taking longer than expected. The upload or save may still be running. Check Entries before retrying; do not submit the same meal twice.", "waiting", { canReview: true });
      }, 30_000);
    });
  }, true);

  const toast = document.querySelector("#toast");
  if (toast) new MutationObserver(() => {
    if (submission?.busy) submission.latestNotice = toast.textContent.trim();
  }).observe(toast, { subtree: true, childList: true, characterData: true });

  new MutationObserver(() => {
    const record = submission;
    if (!record?.busy || logButton.disabled) return;
    // Run after the legacy handler and its toast updates have settled.
    queueMicrotask(() => {
      if (submission !== record || logButton.disabled) return;
      release(record);
      if (record.requestId === null) {
        show(record.hasPhoto
          ? `${record.latestNotice || "Photo processing did not finish."} No nutrition breakdown was confirmed. Check Entries before retrying.`
          : record.latestNotice || "Check Entries to confirm the result of this attempt.",
        record.hasPhoto ? "error" : "info", { canReview: true, canDescribe: record.hasPhoto });
      }
    });
  }).observe(logButton, { attributes: true, attributeFilter: ["disabled"] });

  lifecycle.addEventListener("estimate", (event) => {
    const detail = event.detail;
    const record = submission;
    if (!record?.busy || !detail.quickLog) return;
    if (detail.phase === "start") {
      if (record.requestId !== null) return;
      clearTimeout(record.timer);
      record.requestId = detail.id;
      record.entryId = detail.entryId;
      record.phase = "analyzing";
      show(record.hasPhoto ? "Photo uploaded and entry saved. Identifying the foods and estimating nutrition…"
        : "Entry saved. Estimating nutrition…", "loading");
      return;
    }
    if (detail.id !== record.requestId) return;
    record.phase = detail.phase;
    if (detail.phase === "success") {
      try { renderResult(detail.data); }
      catch (error) { show(error.message, "error", { canReview: true }); }
    } else {
      show(`${detail.message} Your saved entry remains in Entries; review or edit it there before logging again.`, "error", { canReview: true });
    }
  });

  mounted = { hasSubmittedPhoto: () => Boolean(submission?.busy && submission.hasPhoto) };
  return mounted;
}
