"""Synthetic browser checks: actual beta UI modules, mocked account/device storage and network.
Run after node scripts/build-recipe-workflow-beta.mjs. No live accounts or AI calls.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import re, json, shutil, os
import runpy
inline_modules=runpy.run_path(str(Path(__file__).with_name("inline-favorite-modules.py")))["inline_modules"]
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'.artifacts/favorite-search';OUT.mkdir(parents=True,exist_ok=True)
html=(ROOT/'app/app.html').read_text()
html=re.sub(r'<script\b[^>]*>[\s\S]*?</script>','',html)
html=html.replace('<head>','<head><base href="/dist-beta/app/">')
script=r'''
import {initializeSavedFoods} from '/dist-beta/app/saved-foods.js';
import {saveDeviceFood} from '/dist-beta/app/saved-foods-store.js';
import {initRecipeWorkflow} from '/dist-beta/app/recipe-workflow.mjs';
window.aiCalls=[];window.backendReads=0;
const userId='synthetic-search-a';
const standard={item_type:'home_meal',evidence_type:'description_estimate',calories:400,protein_g:30,carbs_g:10,fat_g:15,net_carbs_g:8,fiber_g:2,serving_description:'1 serving'};
window.mockFoods=[
 {...standard,id:'chicken',nickname:'Sunday dinner',name:'Lemon chicken',notes:'Creamy sauce',components:[{name:'Rosemary',calories:1}],is_pinned:true},
 {...standard,id:'soup',item_type:'restaurant_item',name:'Spicy tortilla soup',brand_or_restaurant:'Test Kitchen',notes:'Mexican lunch',components:[{name:'Black beans',calories:30}]},
 {...standard,id:'fish',name:'Café salmon',notes:'Lemon herbs'}
];
await saveDeviceFood(userId,{...standard,id:'pasta',name:'Pasta primavera',notes:'Italian vegetables'});
const db={from(){window.backendReads++;return {select(){return this;},eq(){return this;},order(){return this;},then(resolve,reject){return Promise.resolve({data:structuredClone(window.mockFoods),error:null}).then(resolve,reject);}}}};
window.foodsApi=await initializeSavedFoods({supabase:db,invokeAuthenticated:async()=>{throw Error('Unexpected AI request');},user:{id:userId},defaultMealLabel:()=> 'Dinner',toast:msg=>window.toast=msg,hasCurrentCoreMembership:()=>true,showMembershipPrompt:()=>{},onLedgerChange:()=>{}});
const recipe=(title,ingredients)=>({title,servings:2,summary:title,ingredients,instructions:['Prepare and cook.'],nutrition:{}});
localStorage.setItem('mealdaddy-recipe-workflow-v1:'+userId,JSON.stringify({recipes:[
 {id:'r1',favorite:true,description:'Creamy lemon chicken',recipe:recipe('Herb chicken',[{item:'Rosemary',amount:'1 tsp'}])},
 {id:'r2',favorite:false,description:'Italian vegetables',recipe:recipe('Pasta primavera',[{item:'Zucchini',amount:'1'}])}
],list:{title:'Test list',sources:[],rows:[],dirty:false}}));
window.go=(view,sub)=>{document.body.dataset.appView=view;document.body.dataset.appSubview=sub;};
initRecipeWorkflow({userId,invoke:async(name,opts)=>{window.aiCalls.push({name,...opts});return {data:{recipePlan:recipe('Generated chicken',[{item:'Onion',amount:'1'}]),savedRecipeId:'generated'},error:null};},favorites:()=>window.foodsApi.listRecipeFavorites(),navigate:window.go,nutritionContext:()=>({}),failure:async e=>({message:e.message})});
document.body.classList.remove('auth-loading');
document.querySelector('#saved-foods').open=true;
window.go('log','foods');window.ready=true;
'''
code=inline_modules(ROOT,script)
(OUT/"inlined-fixture.mjs").write_text("async function fixture(){"+code+"}\n")
fixture=OUT/'fixture.html';fixture.write_text(html)
checks=[]
def check(value,message):
    assert value,message
    checks.append(message)
    print("OK",message,flush=True)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=shutil.which('chromium'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':390,'height':844});page.set_default_timeout(5000)
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.route('**/*',lambda route:route.abort())
    page.set_content(html)
    for css in ['styles.css','recipe-workflow.css','favorite-search.css']:
        page.add_style_tag(content=(ROOT/'dist-beta/app'/css).read_text())
    page.evaluate('''()=>{const values=new Map();Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)}});}''')
    page.evaluate('async()=>{'+code+'}')
    page.wait_for_function('window.ready')
    search=page.locator('#saved-foods-mood-search')
    check(page.locator('[data-saved-food]:visible').count()==4,'Main list includes loaded synced and device-only foods')
    check(search.input_value()=='','Favorites initially has no prefilled filter')
    page.screenshot(path=str(OUT/'favorites-all-mobile.png'),full_page=True)
    check(page.locator('[data-saved-food]:visible').first.get_attribute('data-saved-food')=='sync:chicken','Existing pinned ordering preserved')
    search.fill('creamy rosemary')
    check(page.locator('[data-saved-food]:visible').count()==1,'Main list searches notes and components together')
    check(page.locator('#saved-foods-mood-search-count').inner_text()=='1 of 4 saved items shown.','Accessible filtered result count')
    search.press('Enter')
    check(page.evaluate('window.aiCalls.length')==0,'Enter in main filter sends no AI request')
    search.fill('Italian');check(page.locator('[data-saved-food]:visible').first.get_attribute('data-saved-food')=='device:pasta','Device-only meal matches saved notes')
    search.fill('cafe');check(page.locator('[data-saved-food]:visible').first.get_attribute('data-saved-food')=='sync:fish','Accent-insensitive main search')
    search.fill('no-such-meal');check(page.locator('[data-saved-food]:visible').count()==0,'No-match state hides all cards, not deletes them')
    page.locator('#saved-foods .favorite-search-row button').click();check(page.locator('[data-saved-food]:visible').count()==4,'Clear restores all saved cards')
    page.locator('#saved-foods [data-search-word="Chicken"]').click();check(page.locator('[data-saved-food]:visible').count()==1,'Quick search chip filters meals')
    page.locator('#saved-foods [data-search-word="Chicken"]').click();check(page.locator('[data-saved-food]:visible').count()==4,'Repeating quick chip clears query')
    check(page.evaluate('window.backendReads')==1,'Filtering does not reload account data')
    search.fill('spicy');page.screenshot(path=str(OUT/'favorites-mobile.png'),full_page=True)
    for width in [320,360,390,768,1280]:
        page.set_viewport_size({'width':width,'height':850})
        check(page.evaluate('document.documentElement.scrollWidth<=innerWidth'),f'Favorites no horizontal overflow at {width}px')
    page.evaluate("window.go('plan','')")
    page.click('#recreate-favorite')
    chooser=page.locator('#rw-favorite-search');chooser.fill('creamy rosemary')
    check(page.locator('#rw-favorite option').count()==3,'Recreate filter sees saved meal metadata and favorite recipe ingredients')
    chooser.press('Enter');check(page.evaluate('window.aiCalls.length')==0,'Search Enter does not submit recipe form')
    page.fill('#rw-description','My unsaved description');chooser.fill('unmatched')
    check(page.input_value('#rw-description')=='My unsaved description','Filtering preserves the current description')
    chooser.fill('mexican');check(page.locator('#rw-favorite option').count()==2,'Recreate filters by cuisine stored in notes')
    page.select_option('#rw-favorite','sync:soup');check('Spicy tortilla soup' in page.input_value('#rw-description'),'Choosing matching favorite copies intended description')
    page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(OUT/'recreate-search-mobile.png'),full_page=True)
    page.evaluate("window.go('more','')")
    page.click('[data-rw-shopping-launch]');page.locator('#rw-library-picker summary').click()
    r1=page.locator('[data-include-recipe="r1"]');r2=page.locator('[data-include-recipe="r2"]')
    r1.check();library=page.locator('#rw-library-search');library.fill('zucchini')
    check(not r1.is_visible() and r1.is_checked(),'Shopping filter preserves hidden checked recipe')
    check(r2.is_visible(),'Shopping searches ingredient-level recipes')
    r2.check();page.click('[data-rw="apply-selection"]')
    check(page.locator('[data-source]').count()==2,'Apply includes checked recipes hidden by filter')
    page.locator('#rw-library-picker summary').click();page.locator('#rw-library-filter .favorite-search-row button').click()
    page.locator('#rw-library-filter .favorite-search-only input').check()
    check(r1.is_visible() and not r2.is_visible(),'Favorites-only library filter uses saved flag')
    check(r2.is_checked(),'Favorites-only toggle retains nonfavorite selection')
    page.locator('#rw-library-filter .favorite-search-row button').evaluate('(el)=>el.click()')
    check(r1.is_visible() and r2.is_visible(),'Clear restores all meals and clears Favorites-only')
    for width in [320,360,390,768,1280]:
        page.set_viewport_size({'width':width,'height':850})
        check(page.evaluate('document.documentElement.scrollWidth<=innerWidth'),f'Shopping filter no overflow at {width}px')
    check(page.evaluate('window.aiCalls.length')==0,'All search paths work without AI calls')
    check(not errors,'No JavaScript runtime errors')
    browser.close()
(OUT/'results.json').write_text(json.dumps({'fixture':'Real beta UI modules; synthetic records; mocked network and storage; not physical-phone or live-beta testing','checks_passed':len(checks),'checks':checks},indent=2))
print(f'PASS: {len(checks)} favorites browser checks')
