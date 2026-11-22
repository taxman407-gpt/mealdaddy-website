import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {normalizeFavoriteQuery, favoriteSearchText, filterFavorites} from '../app/favorite-search.mjs';
import {patchFavoriteSearch} from '../scripts/favorite-search-beta.mjs';
let count=0;
const check=(actual,expected)=>{assert.deepEqual(actual,expected);count++;};
const meals=[
 {id:'a',name:'Lemon chicken',nickname:'Sunday dinner',brand_or_restaurant:'My Kitchen',notes:'Creamy sauce',components:[{name:'Rosemary'}],favorite:true},
 {id:'b',label:'Spicy tortilla soup',description:'Mexican lunch',ingredients:[{item:'Black beans'}]},
 {id:'c',description:'Café supper',recipe:{title:'Pasta primavera',cuisine:'Italian',ingredients:[{item:'Zucchini'}],tags:['vegetarian']},favorite:true},
 {id:'d',name:'Roast beef',notes:'No added garlic',storage_scope:'device'}
];
const ids=(q='',only=false)=>filterFavorites(meals,q,only).map(m=>m.id);
check(normalizeFavoriteQuery(' CAFÉ—Soup! '),'cafe soup');
check(ids(),['a','b','c','d']);check(ids('  '),['a','b','c','d']);
check(ids('CHICK'),['a']);check(ids('creamy rosemary'),['a']);
check(ids('sunday'),['a']);check(ids('my kitchen'),['a']);
check(ids('mexican beans'),['b']);check(ids('italian zucchini'),['c']);
check(ids('cafe'),['c']);check(ids('vegetarian'),['c']);check(ids('vegan'),[]);
check(ids('chicken soup'),[]);check(ids('unknown'),[]);
check(ids('',true),['a','c']);check(ids('soup',true),[]);
check(ids('beef'),['d']);check(filterFavorites(null,'x'),[]);
check(filterFavorites([null,{}],'x'),[]);
const before=JSON.stringify(meals);ids('creamy');check(JSON.stringify(meals),before);
check(favoriteSearchText({title:'Dish',calories:500,apiKey:'secrets',instructions:['Eat meat'],substitutions:['Chicken alternative']}),'dish');
check(filterFavorites([{label:'<img src=x onerror=alert(1)>'}],'img').length,1);
check(ids('chicken cream'),['a']);check(ids('cream chicken'),['a']);
const saved=readFileSync(new URL('../app/saved-foods.js',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../app/recipe-workflow.mjs',import.meta.url),'utf8');
const patched=patchFavoriteSearch(saved,workflow);
assert.match(patched.savedFoods,/card.hidden = !visible.has/);count++;
assert.match(patched.workflow,/Filtering only hides choices/);count++;
assert.match(patched.workflow,/allowFavoritesOnly:true/);count++;
assert.match(patched.savedFoods,/searchText: favoriteSearchText\(food\)/);count++;
assert.throws(()=>patchFavoriteSearch(patched.savedFoods,patched.workflow));count++;
assert.throws(()=>patchFavoriteSearch(saved.replace('  function foodKey(food) {','  function changed(food) {'),workflow));count++;
const dir=mkdtempSync(join(tmpdir(),'md-search-'));
try {for(const [name,contents] of Object.entries(patched)){
  const file=join(dir,name+'.mjs');writeFileSync(file,contents);
  const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  check(result.status,0);
}} finally {rmSync(dir,{recursive:true,force:true});}
console.log(`PASS: ${count} favorites search checks`);
