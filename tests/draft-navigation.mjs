import assert from 'node:assert/strict';
import { createDraftNavigation } from '../app/draft-navigation.js';
const events = new EventTarget();
const stack = [{}]; let index = 0;
function pop() { const event = new Event('popstate'); event.state = stack[index]; events.dispatchEvent(event); }
const history = {
  get state() { return stack[index]; },
  pushState(state) { stack.splice(++index); stack.push(state); },
  replaceState(state) { stack[index] = state; },
  back() { if (index) { index--; pop(); } }
};
const nav = createDraftNavigation({ history, events, location: { href: 'https://test.invalid/app' } });
let saved = 0, submitted = 0;
nav.open('edit:a', () => saved++);
assert.equal(index, 1);
history.back();
assert.equal(saved, 1);
assert.equal(index, 0);
nav.open('edit:a', () => saved++);
nav.open('leftover', () => saved++);
assert.equal(saved, 2);
assert.equal(index, 1, 'Switching editors must not accumulate history traps.');
nav.close('leftover');
assert.equal(saved, 2, 'Explicit save/cancel must not run the Back autosave callback.');
assert.equal(index, 0);
nav.open('edit:b', () => saved++);
nav.close('unrelated');
assert.equal(index, 1);
history.back();
assert.equal(saved, 3);
assert.equal(submitted, 0);
nav.dispose();
console.log('Draft navigation: Back saves/closes, editor switching reuses history, explicit cancel does not revive a draft.');
