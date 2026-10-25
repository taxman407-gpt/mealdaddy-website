/** Reject foreign paths and excessive image sets before reading private storage. */
export function validatedMealPhotoPaths(estimate, userId) {
  const paths = [...new Set([estimate?.photo_path, ...(Array.isArray(estimate?.photo_paths) ? estimate.photo_paths : [])].filter(Boolean))];
  if (paths.length > 4) throw new Error('Use up to 4 meal photos in total.');
  if (paths.some(path => typeof path !== 'string' || !path.startsWith(`${userId}/`) || path.includes('..') || path.includes('\\') || path.includes('%'))) {
    throw new Error('Invalid private meal photo path.');
  }
  return paths;
}
