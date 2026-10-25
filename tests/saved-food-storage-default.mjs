import assert from 'node:assert/strict';
import {getSavedFoodStorageMode,setSavedFoodStorageMode} from '../app/saved-foods-store.js';
const records=new Map();globalThis.localStorage={getItem:key=>records.get(key)??null,setItem:(key,value)=>records.set(key,value)};
assert.equal(getSavedFoodStorageMode('new-user'),'device_only');
for(const mode of ['sync_cache','device_only','one_time']){
 assert.equal(setSavedFoodStorageMode('existing-user',mode),mode);
 assert.equal(getSavedFoodStorageMode('existing-user'),mode,'Explicit existing choice must survive');
 assert.equal(getSavedFoodStorageMode('other-user'),'device_only','Storage choices are account scoped');
}
assert.equal(setSavedFoodStorageMode('new-user','invalid'),'device_only');
globalThis.localStorage={getItem:()=>{throw Error('blocked')},setItem:()=>{throw Error('blocked')}};
assert.equal(getSavedFoodStorageMode('blocked-user'),'device_only');
assert.equal(setSavedFoodStorageMode('blocked-user','sync_cache'),'sync_cache','Explicit choice still applies for this session');
console.log('Saved foods default to device storage, preserve explicit choices, and never silently select cloud when preference storage fails.');
