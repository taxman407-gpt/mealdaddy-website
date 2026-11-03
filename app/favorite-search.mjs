// Searches only records already loaded for this account. No network or storage writes.
export function normalizeFavoriteQuery(value) {
  return String(value ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}
export function favoriteSearchText(record = {}) {
  const fields = ['label', 'name', 'nickname', 'title', 'description', 'summary', 'notes',
    'brand_or_restaurant', 'cuisine', 'tags', 'flavors', 'searchText'];
  const parts = [];
  const add = value => {
    if (typeof value === 'string') parts.push(value);
    else if (Array.isArray(value)) value.forEach(item => { if (typeof item === 'string') parts.push(item); });
  };
  for (const item of [record, record.recipe].filter(Boolean)) {
    fields.forEach(field => add(item[field]));
    for (const field of ['ingredients', 'components']) {
      if (Array.isArray(item[field])) item[field].forEach(ingredient => {
        if (typeof ingredient === 'string') add(ingredient);
        else if (ingredient && typeof ingredient === 'object') {
          add(ingredient.item); add(ingredient.name);
        }
      });
    }
  }
  return normalizeFavoriteQuery(parts.join(' '));
}
export function filterFavorites(records, query = '', favoritesOnly = false) {
  const words = normalizeFavoriteQuery(query).split(' ').filter(Boolean);
  return (Array.isArray(records) ? records : []).filter(record => {
    if (!record || (favoritesOnly && !record.favorite)) return false;
    if (!words.length) return true;
    const tokens = favoriteSearchText(record).split(' ');
    return words.every(word => tokens.some(token => token.startsWith(word)));
  });
}
export function createFavoriteSearch(host, {id, onChange = () => {}, initialQuery = '',
  allowFavoritesOnly = false, initialFavoritesOnly = false} = {}) {
  if (!host || !id) throw new Error('A search container and unique ID are required.');
  if (!document.querySelector('[data-favorite-search-style]')) {
    const style = document.createElement('link'); style.rel = 'stylesheet';
    style.href = new URL('./favorite-search.css', import.meta.url).href;
    style.dataset.favoriteSearchStyle = 'true'; document.head.append(style);
  }
  host.classList.add('favorite-search');
  const label = document.createElement('label'); label.htmlFor = id;
  label.textContent = 'What are you in the mood for?';
  const row = document.createElement('div'); row.className = 'favorite-search-row';
  const input = document.createElement('input'); input.id = id; input.type = 'search';
  input.maxLength = 160; input.autocomplete = 'off'; input.enterKeyHint = 'search';
  input.placeholder = 'Try chicken, soup, spicy, or Italian'; input.value = initialQuery;
  input.setAttribute('aria-describedby', `${id}-hint ${id}-count`);
  const clear = document.createElement('button'); clear.type = 'button'; clear.textContent = 'Clear';
  clear.setAttribute('aria-label', 'Clear favorite meal search');
  row.append(input, clear);
  const hint = document.createElement('p'); hint.id = `${id}-hint`;
  hint.textContent = 'Search names, ingredients, flavors, cuisines, or restaurants.';
  const chips = document.createElement('div'); chips.className = 'favorite-search-chips';
  chips.setAttribute('role', 'group'); chips.setAttribute('aria-label', 'Quick meal searches');
  for (const word of ['Chicken', 'Soup', 'Spicy', 'Pasta']) {
    const chip = document.createElement('button'); chip.type = 'button'; chip.textContent = word;
    chip.dataset.searchWord = word; chip.setAttribute('aria-pressed', 'false');
    chip.addEventListener('click', () => { input.value = normalizeFavoriteQuery(input.value) === word.toLowerCase() ? '' : word; notify(); });
    chips.append(chip);
  }
  const favoriteOnly = document.createElement('input'); favoriteOnly.type = 'checkbox';
  favoriteOnly.checked = Boolean(initialFavoritesOnly);
  const favoriteLabel = document.createElement('label'); favoriteLabel.className = 'favorite-search-only';
  const favoriteText = document.createElement('span'); favoriteText.textContent = 'Favorites only';
  favoriteLabel.append(favoriteOnly, favoriteText); favoriteLabel.hidden = !allowFavoritesOnly;
  const count = document.createElement('p'); count.id = `${id}-count`; count.setAttribute('role', 'status');
  count.setAttribute('aria-live', 'polite'); count.setAttribute('aria-atomic', 'true');
  count.textContent = 'Loading saved meals…';
  host.replaceChildren(label, row, hint, chips, favoriteLabel, count);
  function notify() {
    clear.disabled = !input.value;
    chips.querySelectorAll('button').forEach(chip => chip.setAttribute('aria-pressed',
      String(normalizeFavoriteQuery(input.value) === chip.dataset.searchWord.toLowerCase())));
    onChange();
  }
  input.addEventListener('input', event => { if (!event.isComposing) notify(); });
  input.addEventListener('compositionend', notify);
  input.addEventListener('search', notify);
  input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); notify(); } });
  clear.addEventListener('click', () => { input.value = ''; notify(); input.focus(); });
  favoriteOnly.addEventListener('change', notify);
  clear.disabled = !input.value;
  return {
    get query() { return input.value; },
    get favoritesOnly() { return allowFavoritesOnly && favoriteOnly.checked; },
    filter(records) { return filterFavorites(records, input.value, allowFavoritesOnly && favoriteOnly.checked); },
    updateCount(total, shown) {
      count.textContent = total === 0 ? 'No saved meals yet.' : shown === 0
        ? `No matches among ${total} saved items. Try another keyword or clear the filters.`
        : `${shown} of ${total} saved ${total === 1 ? 'item' : 'items'} shown.`;
    }
  };
}
