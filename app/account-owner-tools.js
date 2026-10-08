/** Owner-only navigation. Every administrative action remains server-authorized. */
export function createOwnerToolsController({
  supabase, invokeAuthenticated, userId,
  button = document.querySelector("#owner-tools-link"),
  status = document.querySelector("#owner-tools-status"),
  page = document,
  navigate = (path) => location.assign(path)
}) {
  let revision = 0;
  let signedOut = false;
  let eligible = false;
  let busy = false;

  function message(text = "") {
    if (!status) return;
    status.textContent = text;
    status.hidden = !text;
  }

  function hide() {
    eligible = false;
    button.hidden = true;
    message();
  }

  async function refresh() {
    if (signedOut) return false;
    const requestRevision = ++revision;
    try {
      const { data, error } = await invokeAuthenticated("owner-access-status", {
        body: {}
      });
      if (signedOut || requestRevision !== revision) return false;
      eligible = !error && data?.ok === true && data?.isOwner === true;
      button.hidden = !eligible;
      if (!eligible) message();
      else if (!busy) message("Private owner administration. Two-step verification is required.");
      return eligible;
    } catch {
      if (requestRevision === revision) hide();
      return false;
    }
  }

  async function open(event) {
    event?.preventDefault();
    if (busy || signedOut) return;
    busy = true;
    button.disabled = true;
    try {
      if (!await refresh()) return;
      const [levelResult, factorResult] = await Promise.all([
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.auth.mfa.listFactors()
      ]);
      if (signedOut) return;
      if (levelResult.error || factorResult.error) {
        throw new Error("Two-step verification could not be checked. Please try again.");
      }
      const hasFactor = (factorResult.data?.all || []).some((factor) =>
        factor.status === "verified" && ["totp", "phone"].includes(factor.factor_type)
      );
      if (!hasFactor || levelResult.data?.currentLevel !== "aal2") {
        message("Complete two-step verification below, then select Owner Tools again.");
        const heading = page.querySelector("#security-title");
        heading?.scrollIntoView({ behavior: "auto", block: "start" });
        heading?.focus({ preventScroll: true });
        const action = page.querySelector(hasFactor ? "#mfa-step-up" : "#mfa-enroll");
        if (action && !action.hidden && !action.disabled) action.click();
        return;
      }
      // A visible button (or an edited browser DOM) never authorizes an action.
      const { data, error } = await invokeAuthenticated("manage-family-access", {
        body: { action: "authorize" }
      });
      if (signedOut) return;
      if (error || data?.ok !== true) {
        throw new Error("Owner authorization was not confirmed. Verify your session and try again.");
      }
      navigate("./feedback-insights.html");
    } catch (error) {
      if (eligible && !signedOut) message(error.message || "Owner Tools could not be opened.");
    } finally {
      busy = false;
      button.disabled = false;
    }
  }

  button.addEventListener("click", open);
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT" || (session?.user?.id && session.user.id !== userId)) {
      signedOut = true;
      revision += 1;
      hide();
      return;
    }
    // Run outside Supabase's auth callback to avoid holding its session lock.
    if (["SIGNED_IN", "TOKEN_REFRESHED", "MFA_CHALLENGE_VERIFIED", "USER_UPDATED"].includes(event)) {
      setTimeout(() => { refresh().catch(() => {}); }, 0);
    }
  });
  return { refresh };
}
