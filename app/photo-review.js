export function reviewedPhotoDescription(description, decisions) {
  const base = String(description || '').trim();
  const parts = base.toLowerCase() === 'meal photo' ? [] : base.split(';').map((part) => part.trim()).filter(Boolean);
  const included = new Set(parts.map((part) => part.toLowerCase()));
  for (const { choice, name, correction } of decisions) {
    if (!['add', 'exclude', 'correct'].includes(choice)) throw new Error('Choose Add, Exclude, or Correct for each suspected item.');
    if (choice === 'exclude') continue;
    const item = String(choice === 'correct' ? correction || '' : name || '').trim();
    if (!item) throw new Error('Enter the corrected food or drink and amount.');
    if (!included.has(item.toLowerCase())) { parts.push(item); included.add(item.toLowerCase()); }
  }
  const result = parts.join('; ');
  if (!result) throw new Error('Describe what you ate before calculating this meal.');
  if (result.length > 1200) throw new Error('Keep the meal description within 1,200 characters.');
  return result;
}
