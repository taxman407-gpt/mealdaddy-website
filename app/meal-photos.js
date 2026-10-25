import { preparePrivateImage } from './private-image.js?v=20261004-1';
import { photoValidationMessage } from './entry-reliability.js?v=20261016-1';

export const maxMealPhotos = 4;
export function mealPhotoPaths(estimate = {}) {
  return [...new Set([estimate?.photo_path, ...(Array.isArray(estimate?.photo_paths) ? estimate.photo_paths : [])]
    .filter(path => typeof path === 'string' && path))];
}
export function photoMetadata(estimate = {}) {
  const paths = mealPhotoPaths(estimate);
  const metadata = paths.length ? { photo_path: paths[0], photo_paths: paths } : {};
  for (const key of ['restaurant', 'restaurant_address', 'restaurant_order', 'substitutions', 'source_url', 'source_checked_on']) {
    if (estimate[key] !== undefined) metadata[key] = estimate[key];
  }
  return metadata;
}
export function mealPhotoControls(estimate) {
  const count = mealPhotoPaths(estimate).length;
  return `<fieldset data-meal-photos><legend>Meal photos (optional)</legend>
    <p>${count} saved · up to ${maxMealPhotos} photos per meal. Different angles show the same meal, not extra servings.</p>
    <div data-saved-photo-links></div>
    <label>Add photos<input name="meal_photos" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple /></label>
    <ul data-pending-photos></ul>
    <label><input type="checkbox" name="analyze_photos" /> Analyze meal photos when saving</label>
    <small>Leave unchecked to keep saved nutrition when only attaching photos. Your description and substitutions take priority. Use the separate leftover option for food remaining.</small>
    <p role="status" data-meal-photo-status></p></fieldset>`;
}
export function renderPendingPhotos(form) {
  const list = form.querySelector('[data-pending-photos]');
  if (!list) return;
  list.replaceChildren();
  for (const [index, file] of (form.mealPhotoFiles || []).entries()) {
    const li = document.createElement('li');
    li.append(document.createTextNode(file.name || `Photo ${index + 1}`));
    const remove = document.createElement('button');
    remove.type = 'button'; remove.dataset.removePendingPhoto = String(index);
    remove.textContent = 'Remove'; remove.setAttribute('aria-label', `Remove ${file.name || 'photo'}`);
    li.append(remove); list.append(li);
  }
}
export function addMealPhotos(form, estimate, files) {
  const candidates = [...(form.mealPhotoFiles || []), ...files];
  const combined = candidates.filter((file, i) => candidates.findIndex(other => other.name === file.name && other.size === file.size && other.lastModified === file.lastModified) === i);
  if (mealPhotoPaths(estimate).length + combined.length > maxMealPhotos) throw new Error(`Use up to ${maxMealPhotos} meal photos in total.`);
  for (const file of combined) { const error = photoValidationMessage(file); if (error) throw new Error(error); }
  form.mealPhotoFiles = combined;
  renderPendingPhotos(form);
}
export async function showSavedPhotos(form, estimate, storage) {
  const holder = form.querySelector('[data-saved-photo-links]');
  if (!holder) return;
  holder.replaceChildren();
  for (const [index, path] of mealPhotoPaths(estimate).entries()) {
    const { data, error } = await storage.createSignedUrl(path, 300);
    if (!form.isConnected) return;
    if (error || !data?.signedUrl) continue;
    const link = document.createElement('a');
    link.href = data.signedUrl; link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.textContent = `View photo ${index + 1} `;
    holder.append(link);
  }
}
export async function uploadMealPhotos(files, existing, userId, storage) {
  if (existing.length + files.length > maxMealPhotos) throw new Error(`Use up to ${maxMealPhotos} meal photos in total.`);
  const uploaded = [];
  try {
    for (const file of files) {
      const problem = photoValidationMessage(file); if (problem) throw new Error(problem);
      const prepared = await preparePrivateImage(file);
      const path = `${userId}/meal-${crypto.randomUUID()}-${prepared.name.replace(/[^a-z0-9._-]/gi, '-')}`;
      const { error } = await storage.upload(path, prepared, { upsert: false, contentType: prepared.type });
      if (error) throw error;
      uploaded.push(path);
    }
    return uploaded;
  } catch (error) {
    if (uploaded.length) await storage.remove(uploaded).catch(() => {});
    throw error;
  }
}
