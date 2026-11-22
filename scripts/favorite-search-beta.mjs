import {cpSync, readFileSync, writeFileSync} from 'node:fs';
function replaceOnce(text, before, after) {
  if (text.split(before).length !== 2) throw new Error(`Favorite-search integration anchor changed: ${before.slice(0,80)}`);
  return text.replace(before, after);
}
// Opt-in beta artifact only; never change the existing saved-food storage policy.
export function patchFavoriteSearch(savedFoods, workflow) {
  const header = 'import {createFavoriteSearch, favoriteSearchText} from "./favorite-search.mjs";\n';
  if (savedFoods.includes(header) || workflow.includes(header)) throw new Error('Favorite search is already installed.');
  savedFoods = header + savedFoods;
  savedFoods = replaceOnce(savedFoods, '  function foodKey(food) {', `  const favoriteSearchHost = document.createElement('div');
  root.querySelector('#saved-foods-list').before(favoriteSearchHost);
  const favoritesSearch = createFavoriteSearch(favoriteSearchHost, {
    id: 'saved-foods-mood-search', onChange: applyFavoriteFilter
  });
  function applyFavoriteFilter() {
    const visible = new Set(favoritesSearch.filter(state.foods).map(foodKey));
    root.querySelectorAll('[data-saved-food]').forEach(card => {
      card.hidden = !visible.has(card.dataset.savedFood);
    });
    favoritesSearch.updateCount(state.foods.length, visible.size);
  }

  function foodKey(food) {`);
  savedFoods = replaceOnce(savedFoods, '    if (!state.foods.length) {\n      list.innerHTML', `    if (!state.foods.length) {
      favoritesSearch.updateCount(0, 0);
      document.dispatchEvent(new Event('mealdaddy:favorites-updated'));
      list.innerHTML`);
  savedFoods = replaceOnce(savedFoods, '    list.innerHTML = state.foods.map(foodCard).join("");\n    void hydrateFoodPhotos();', `    list.innerHTML = state.foods.map(foodCard).join("");
    applyFavoriteFilter();
    document.dispatchEvent(new Event('mealdaddy:favorites-updated'));
    void hydrateFoodPhotos();`);
  savedFoods = replaceOnce(savedFoods, '({ id: foodKey(food), label: displayName(food), description:',
    '({ id: foodKey(food), label: displayName(food), searchText: favoriteSearchText(food), description:');
  workflow = header + workflow;
  workflow = replaceOnce(workflow, "  let mode = 'favorite', current = null, busy = false, loadFailed = false, active = true;", `  let mode = 'favorite', current = null, busy = false, loadFailed = false, active = true;
  let favoriteSearch = null, librarySearch = null, libraryQuery = '', libraryFavoritesOnly = false;`);
  workflow = replaceOnce(workflow, 'label:`${r.recipe.title} · saved recipe`,description:r.description',
    'label:`${r.recipe.title} · saved recipe`,description:r.description,recipe:r.recipe');
  const start = workflow.indexOf('  function refreshFavorites() {');
  const end = workflow.indexOf('  function renderStart() {', start);
  if (start < 0 || end < 0) throw new Error('Favorite-picker boundary changed.');
  workflow = workflow.slice(0,start) + `  function refreshFavorites() {
    const select=q('#rw-favorite'); if(!select)return;
    const prior=select.value, all=availableFavorites();
    const matches=favoriteSearch ? favoriteSearch.filter(all) : all;
    select.replaceChildren(new Option(matches.length ? 'Choose a saved meal…' : 'No matching meals',''),...matches.map(f=>new Option(f.label,f.id)));
    select.value=matches.some(f=>f.id===prior) ? prior : '';
    favoriteSearch?.updateCount(all.length,matches.length);
    q('#rw-favorite-help').textContent=matches.length ? 'Choose a meal, then review its description. Filtering will not overwrite your description below.' : all.length ? 'Try another keyword or clear the filter. Your saved meals have not been changed.' : 'No saved meal favorites are available yet. Describe a meal or find a restaurant menu choice.';
  }
  document.addEventListener('mealdaddy:favorites-updated', () => {if(active) refreshFavorites();});
` + workflow.slice(end);
  workflow = replaceOnce(workflow, "    refreshFavorites();mode='favorite';", `    const filterHost=document.createElement('div');q('#rw-favorites').prepend(filterHost);
    favoriteSearch=createFavoriteSearch(filterHost,{id:'rw-favorite-search',initialQuery:favoriteSearch?.query || '',onChange:refreshFavorites});
    refreshFavorites();mode='favorite';`);
  workflow = replaceOnce(workflow, '<details><summary>Choose saved recipes (${data.recipes.length})</summary><p>Favorites are marked ★. Only checked recipes are included.</p>',
    '<details id="rw-library-picker"><summary>Choose saved recipes (${data.recipes.length})</summary><div id="rw-library-filter"></div><p>Favorites are marked ★. Filtering only hides choices; previously checked recipes stay selected. Only checked recipes are included.</p>');
  workflow = replaceOnce(workflow, '  function download(text,name) {', `  function applyLibraryFilter() {
    const matches=librarySearch.filter(data.recipes), ids=new Set(matches.map(r=>r.id));
    shopping.querySelectorAll('[data-include-recipe]').forEach(input=>{input.closest('label').hidden=!ids.has(input.dataset.includeRecipe);});
    librarySearch.updateCount(data.recipes.length,matches.length);
    libraryQuery=librarySearch.query;libraryFavoritesOnly=librarySearch.favoritesOnly;
  }
  function download(text,name) {`);
  const endShopping = '<p class="rw-status" role="status"></p>`;\n  }\n  function applyLibraryFilter()';
  const endShoppingWithSearch = '<p class="rw-status" role="status"></p>`;\n' +
    "    librarySearch=createFavoriteSearch(qs('#rw-library-filter'),{id:'rw-library-search',initialQuery:libraryQuery,allowFavoritesOnly:true,initialFavoritesOnly:libraryFavoritesOnly,onChange:applyLibraryFilter});\n" +
    '    applyLibraryFilter();\n  }\n  function applyLibraryFilter()';
  workflow = replaceOnce(workflow, endShopping, endShoppingWithSearch);
  return {savedFoods, workflow};
}
export function addFavoriteSearchBeta(out='dist-beta') {
  const paths={savedFoods:out+'/app/saved-foods.js', workflow:out+'/app/recipe-workflow.mjs'};
  const patched=patchFavoriteSearch(readFileSync(paths.savedFoods,'utf8'),readFileSync(paths.workflow,'utf8'));
  for(const file of ['favorite-search.mjs','favorite-search.css']) cpSync('app/'+file,out+'/app/'+file);
  for(const [name,path] of Object.entries(paths)) writeFileSync(path,patched[name]);
}
