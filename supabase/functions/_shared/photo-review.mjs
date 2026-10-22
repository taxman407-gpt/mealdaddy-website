/** Visual guesses never contribute nutrients until explicitly accepted. */
export function gatePhotoComponents(estimate, hasImage, requireAll = false) {
  if (!hasImage) return estimate;
  const accepted = [];
  const pending = [];
  for (const component of estimate.components) {
    // Missing classification fails closed, including an older provider response.
    if (requireAll || component.confirmation_required !== false) {
      pending.push({ name: component.name, reason: component.confirmation_reason || "This may be visible in the photograph, but its identity or inclusion needs your confirmation." });
    } else accepted.push(component);
  }
  estimate.components = accepted;
  estimate.photo_review = pending;
  if (pending.length) {
    // A score for the unconfirmed complete image would misrepresent this meal.
    delete estimate.inflammation_score;
    estimate.inflammation_summary = "Confirm the suspected photo items before reviewing the meal's composition score.";
  }
  return estimate;
}
