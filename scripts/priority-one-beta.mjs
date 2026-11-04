import {cpSync, readFileSync, writeFileSync} from 'node:fs';
const replaceOnce = (text, before, after) => {
  if (text.split(before).length !== 2) throw new Error(`Priority-one integration anchor changed: ${before.slice(0, 90)}`);
  return text.replace(before, after);
};
export function patchPriorityOne(app, client) {
  if (app.includes('initializePriorityOneUI(')) throw new Error('Priority-one UI is already installed.');
  app = 'import {initializePriorityOneUI, aiSetupError, isAiSetupError} from "./priority-one-ui.mjs";\nimport {initializePantryReview} from "./pantry-review.mjs";\nimport {guardPlanningBack} from "./planning-view-history.mjs";\nimport {betaSource} from "./beta-connection.js";\n' + app;
  const setup = `const priorityOneUi = initializePriorityOneUI({navigate: showAppSubview, getSource: () => betaSource(user.id)});
async function checkPriorityOneConnection() {
  let error = null;
  if (!betaSource(user.id)) error = aiSetupError();
  else if (betaSource(user.id) === 'personal') {
    try {
      if (localStorage.getItem(\`mealdaddy-byok-source:\${user.id}\`) !== 'cloud' && !await byokVault.read()) error = aiSetupError('Connect your selected BYOK provider, model and key in AI Settings.');
    } catch {error = aiSetupError('The device connection could not be read. Reconnect your selected provider in AI Settings.');}
  }
  if (error) priorityOneUi.show(error);
  return error;
}
const pantryReview = initializePantryReview({userId: user.id, invoke: invokeMemberAi, failure: readFunctionFailure,
  storage: supabase.storage.from('meal-photos'), prepareImage: preparePrivateImage, navigate: showAppSubview,
  drafts: mealDrafts, checkConnection: checkPriorityOneConnection, nutritionContext: () => ({
    calories: Math.round(state.currentTotals.calories), protein: Math.round(state.currentTotals.protein),
    totalCarbs: Math.round(state.currentTotals.carbs), netCarbs: Math.round(state.currentTotals.netCarbs),
    netCarbGoal: state.netCarbGoal || null, hydrationOunces: Math.round(state.currentTotals.water),
    hydrationGoalOunces: state.waterGoal, sodiumMg: state.currentTotals.sodium, sodiumGoalMg: state.sodiumGoal
  })});
guardPlanningBack({subview: 'recreate', parentView: 'plan', navigate: showAppSubview});
guardPlanningBack({subview: 'shopping', parentView: 'more', navigate: showAppSubview});
document.addEventListener('change', event => {
  if (event.target.id === 'beta-source') queueMicrotask(() => {
    for (const [id, message] of state.estimateFailures) if (isAiSetupError({message})) state.estimateFailures.delete(id);
    renderLedger();
  });
});
`;
  app = replaceOnce(app, 'initRecipeWorkflow({', setup + 'initRecipeWorkflow({');
  app = replaceOnce(app, 'async function invokeMemberAi(functionName, options = {}) {', `async function invokeMemberAi(functionName, options = {}) {
  const setupError = await checkPriorityOneConnection();
  if (setupError) return {data: null, error: setupError};`);
  app = replaceOnce(app, 'if (state.membershipPlan !== "byo") return invokeAuthenticated(functionName, options);', 'if (state.membershipPlan !== "byo" && betaSource(user.id) !== "personal") return invokeAuthenticated(functionName, options);');
  app = replaceOnce(app, '  const membershipRequired = failure.status === 402', `  if (isAiSetupError(error)) {
    const message = error.message + ' This saved entry is not included in totals yet. Open AI Settings, then retry this entry.';
    rememberEstimateFailure(entryId, message); priorityOneUi.show(error); toast(message); return message;
  }
  const membershipRequired = failure.status === 402`);
  app = replaceOnce(app, '    const retryEstimate = entry.status === "pending_estimate"', `    const aiNeedsSetup = !betaSource(user.id) || isAiSetupError({message: state.estimateFailures.get(entry.id)});
    const retryEstimate = entry.status === "pending_estimate"`);
  app = replaceOnce(app, '${estimateIsRunning ? " disabled" : ""}>${estimateIsRunning ? "Estimating…" : "Retry estimate"}</button></div>', '${estimateIsRunning || !betaSource(user.id) ? " disabled" : ""}>${estimateIsRunning ? "Estimating…" : "Retry estimate"}</button>${aiNeedsSetup ? \'<button type="button" data-open-ai-settings>Open AI Settings</button>\' : ""}</div>');
  app = replaceOnce(app, '$ ("#plan-dinner").addEventListener("click", () => openCoachAction("dinner"));'.replace('$ (', '$('), '$ ("#plan-dinner").addEventListener("click", () => { void pantryReview.open(); });'.replace('$ (', '$('));
  const feedbackStart = app.indexOf('$ ("#personalize-feedback").addEventListener'.replace('$ (', '$('));
  const feedbackEnd = app.indexOf('$ ("#close-coach-action").addEventListener'.replace('$ (', '$('), feedbackStart);
  if (feedbackStart < 0 || feedbackEnd < 0) throw new Error('Personalized-plan integration changed.');
  const feedback = app.slice(feedbackStart, feedbackEnd).replace('  openCoachAction("dinner");', '')
    .replace('$ ("#coach-action-context").focus();'.replace('$ (', '$('), 'void pantryReview.open($ ("#coach-action-context").value);'.replace('$ (', '$('));
  app = app.slice(0, feedbackStart) + feedback + app.slice(feedbackEnd);
  // These two temporary-photo handlers had an out-of-scope variable. Cleanup must never strand the button.
  for (const [name, label] of [['removeError', 'coach'], ['cleanupError', 'after-meal']]) {
    const before = `      const { error: ${name} } = await supabase.storage.from("meal-photos").remove(uploadedPhotoPaths);\n      if (${name}) console.warn("Temporary ${label} photo cleanup failed.", ${name});`;
    const after = `      try {\n        const { error: ${name} } = await supabase.storage.from("meal-photos").remove([photoPath]);\n        if (${name}) console.warn("Temporary ${label} photo cleanup failed.");\n      } catch { console.warn("Temporary ${label} photo cleanup failed."); }`;
    app = replaceOnce(app, before, after);
  }
  client = replaceOnce(client, "'recipe-recreation']);", "'recipe-recreation','pantry-review']);");
  client = replaceOnce(client, '    if (safeMessage) return { data: payload, error: new Error(safeMessage) };',
    '    if (safeMessage) return { data: payload, error: Object.assign(new Error(safeMessage), {status: result.error.context.status, context: result.error.context, code: payload.code}) };');
  return {app, client};
}

export function addPriorityOneBeta(out = 'dist-beta') {
  for (const file of ['priority-one-ui.mjs','priority-one.css','pantry-review-core.mjs','pantry-review.mjs','pantry-review.css','planning-view-history.mjs']) cpSync('app/' + file, out + '/app/' + file);
  const appPath = out + '/app/app.js', clientPath = out + '/app/supabase-client.js';
  const patched = patchPriorityOne(readFileSync(appPath, 'utf8'), readFileSync(clientPath, 'utf8'));
  writeFileSync(appPath, patched.app); writeFileSync(clientPath, patched.client);
}
