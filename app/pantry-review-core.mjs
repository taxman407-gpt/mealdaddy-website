// Pure, deterministic review state. A photo suggestion never becomes confirmed stock implicitly.
export const MAX_PANTRY_PHOTOS = 6;
export const MAX_PANTRY_BYTES = 24 * 1024 * 1024;
const photoTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const key = value => String(value || '').normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
export function appendPantryPhotos(current, added) {
  const result = [...current];
  for (const file of added) {
    if (!photoTypes.has(file.type) || /\.(heic|heif)$/i.test(file.name)) throw new Error('Choose JPG, PNG, WebP or GIF photos. Convert HEIC/HEIF first.');
    if (!(file.size > 0) || file.size > 8 * 1024 * 1024) throw new Error('Each photo must be nonempty and no larger than 8 MB.');
    if (!result.some(old => old.name === file.name && old.size === file.size && old.lastModified === file.lastModified)) result.push(file);
  }
  if (result.length > MAX_PANTRY_PHOTOS) throw new Error(`Use up to ${MAX_PANTRY_PHOTOS} photos. Earlier selections have been kept.`);
  if (result.reduce((sum, file) => sum + file.size, 0) > MAX_PANTRY_BYTES) throw new Error('Choose photos totaling no more than 24 MB. Earlier selections have been kept.');
  return result;
}
export function mergeInterpretation(prior, incoming, id = () => crypto.randomUUID()) {
  if (!Array.isArray(incoming) || incoming.length > 60) throw new Error('The photo interpretation is incomplete. Retry or enter foods yourself.');
  const preserved = prior.filter(row => row.edited).map(row => ({...row}));
  for (const item of incoming) {
    if (!item || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 160 || typeof item.quantity !== 'string' || item.quantity.length > 100) throw new Error('The interpretation contains an invalid item. Review your photos or enter foods yourself.');
    if (preserved.some(row => key(row.name) === key(item.name) || key(row.originalName) === key(item.name))) continue;
    const duplicate = preserved.find(row => key(row.name) === key(item.name));
    if (duplicate) continue;
    const old = prior.find(row => key(row.originalName || row.name) === key(item.name));
    const uncertain = item.confidence !== 'high';
    preserved.push({id: old?.id || id(), originalName: item.name.trim(), name: item.name.trim(), quantity: item.quantity.trim(),
      included: !uncertain, uncertain, edited: false, note: String(item.note || '').slice(0, 300),
      photoNumbers: Array.isArray(item.photo_numbers) ? item.photo_numbers.filter(n => Number.isInteger(n) && n >= 1 && n <= MAX_PANTRY_PHOTOS) : []});
  }
  return preserved;
}
export function confirmedInventory(rows) {
  const included = rows.filter(row => row.included);
  if (!included.length) throw new Error('Include at least one food, or add an item, before confirming.');
  if (included.length > 60) throw new Error('Use no more than 60 foods in one review.');
  const names = new Set();
  return included.map(row => {
    const name = String(row.name || '').trim(), quantity = String(row.quantity || '').trim();
    if (!name || name.length > 160 || quantity.length > 100) throw new Error('Check the food names and quantities before confirming.');
    if (names.has(key(name))) throw new Error(`“${name}” appears twice. Combine the amounts or distinguish the foods before confirming.`);
    names.add(key(name));
    return {name, quantity}; // No original AI interpretation, excluded row or photo is sent downstream.
  });
}
export async function useTemporaryPantryPhotos(files, {userId, storage, prepare, invoke, onCleanupIssue = () => {}}) {
  const paths = [];
  try {
    for (const file of files) {
      const prepared = await prepare(file);
      const path = `${userId}/pantry-scan-${crypto.randomUUID()}.jpg`;
      const {error} = await storage.upload(path, prepared, {upsert: false, contentType: prepared.type});
      if (error) throw new Error('A photo could not be uploaded. Your selections are still available; retry when connected.');
      paths.push(path);
    }
    return await invoke(paths);
  } finally {
    if (paths.length) {
      try { const {error} = await storage.remove(paths); if (error) onCleanupIssue([...paths]); }
      catch { onCleanupIssue([...paths]); }
    }
  }
}
