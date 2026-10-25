export function reviewedPhotoDescription(description, decisions) {
  const base = String(description || '').trim();
  let parts = base.toLowerCase() === 'meal photo' ? [] : base.split(';').map((part) => part.trim()).filter(Boolean);
  for (const { choice, name, correction } of decisions) {
    if (!['add', 'exclude', 'correct'].includes(choice)) throw new Error('Choose Add, Exclude, or Correct for each suspected item.');
    const original = String(name || '').trim().toLowerCase();
    // Replace whole listed items only: a guessed name must not rewrite unrelated prose.
    if (choice === 'exclude' || choice === 'correct') {
      parts = parts.filter((part) => part.toLowerCase() !== original);
    }
    if (choice === 'exclude') continue;
    const item = String(choice === 'correct' ? correction || '' : name || '').trim();
    if (!item) throw new Error('Enter the corrected food or drink and amount.');
    if (!parts.some((part) => part.toLowerCase() === item.toLowerCase())) parts.push(item);
  }
  const result = parts.join('; ');
  if (!result) throw new Error('Describe what you ate before calculating this meal.');
  if (result.length > 1200) throw new Error('Keep the meal description within 1,200 characters.');
  return result;
}
