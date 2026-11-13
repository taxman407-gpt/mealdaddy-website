"""Real beta UI modules/CSS with synthetic food records and mocked network/draft storage.
No account writes or provider requests. Browser sandbox blocks URL navigation; modules are inlined.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw
import re, json, runpy, io
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'.artifacts/priority-one';OUT.mkdir(parents=True,exist_ok=True)
inline=runpy.run_path(str(Path(__file__).with_name('inline-favorite-modules.py')))['inline_modules']
html=re.sub(r'<script\b[^>]*>[\s\S]*?</script>','',(ROOT/'app/app.html').read_text())
script=r'''
import {initializePriorityOneUI, aiSetupError} from '/dist-beta/app/priority-one-ui.mjs';
import {initializePantryReview} from '/dist-beta/app/pantry-review.mjs';
import {initRecipeWorkflow} from '/dist-beta/app/recipe-workflow.mjs';
import {guardPlanningBack} from '/dist-beta/app/planning-view-history.mjs';
window.source='';window.calls=[];window.uploads=[];window.removals=[];window.drafts={};window.cleanupFail=false;window.failureMode=false;
window.go=(view,sub='')=>{document.body.dataset.appView=view;document.body.dataset.appSubview=sub;document.querySelectorAll('[data-app-nav]').forEach(el=>{el.classList.toggle('is-active',el.dataset.appNav===view);el.setAttribute('aria-current',el.dataset.appNav===view?'page':'false');});};
const selector=document.createElement('select');selector.id='beta-source';selector.innerHTML='<option value="">Choose a connection</option><option value="hosted_openai">OpenAI</option>';
selector.addEventListener('change',()=>window.source=selector.value);const connectionPanel=document.createElement('section');connectionPanel.className='beta-panel beta-connection-panel';connectionPanel.innerHTML='<h2>Beta AI connection</h2><label for="beta-source">Use for AI requests</label>';connectionPanel.append(selector);document.querySelector('#provider-settings').before(connectionPanel);
window.setup=initializePriorityOneUI({navigate:window.go,getSource:()=>window.source});
const check=async()=>{if(!window.source){const error=aiSetupError();window.setup.show(error);return error;}return null;};
const invoke=async(name,{body})=>{
 window.calls.push({name,body:structuredClone(body)});
 if(window.failureMode)return{data:null,error:Error('Synthetic provider failure; draft is preserved.')};
 if(body.action==='interpret')return{data:{ok:true,items:[
  {name:'Chicken',quantity:'4 oz',confidence:'high',note:'',photo_numbers:[1]},
  {name:'Spinach',quantity:'',confidence:'high',note:'Quantity unknown.',photo_numbers:[1]},
  {name:'Mystery tub',quantity:'',confidence:'low',note:'Could be yogurt or sour cream.',photo_numbers:[2]}
 ]},error:null};
 return{data:{ok:true,guidance:'Recipe from confirmed foods: '+body.items.map(x=>x.name).join(', ')+'.\nUse a lemon-herb sauce.\n<script>window.untrusted=true</script>'},error:null};
};
const pantry=initializePantryReview({userId:'00000000-0000-4000-8000-000000000001',invoke,failure:async error=>({message:error.message}),
 storage:{upload:async(path,file)=>{window.uploads.push({path,size:file.size});return{error:null};},remove:async paths=>{window.removals.push([...paths]);if(window.cleanupFail)throw Error('offline');return{error:null};}},
 prepareImage:async file=>file,navigate:window.go,nutritionContext:()=>({netCarbs:10,netCarbGoal:40}),checkConnection:check,
 drafts:{read:async key=>window.drafts[key]||null,save:async(key,value)=>{window.drafts[key]=structuredClone(value);},remove:async key=>delete window.drafts[key]}});
window.pantry=pantry;
initRecipeWorkflow({userId:'synthetic-ui',invoke,failure:async error=>({message:error.message}),favorites:()=>[
 {id:'a',label:'Chicken with lemon-herb sauce',description:'Chicken with lemon-herb sauce'},
 {id:'b',label:'Spicy tortilla soup',description:'Spicy soup'},
 {id:'c',label:'Café salmon',description:'Salmon with dill'},
 {id:'d',label:'Pasta primavera',description:'Italian vegetables'}
],navigate:window.go,nutritionContext:()=>({})});
guardPlanningBack({subview:'recreate',parentView:'plan',navigate:window.go});
document.querySelector('#plan-dinner').addEventListener('click',()=>pantry.open());
document.body.classList.remove('auth-loading');
await pantry.open();window.ready=true;
'''
code=inline(ROOT,script)
checks=[]
def check(value,message):
 assert value,message
 checks.append(message);print('OK',message,flush=True)
image=Image.new('RGB',(240,160),'white');ImageDraw.Draw(image).text((16,60),'SYNTHETIC FOOD PHOTO',fill='black');buf=io.BytesIO();image.save(buf,format='PNG');png=buf.getvalue()
def photo(name):return {'name':name,'mimeType':'image/png','buffer':png}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':390,'height':844});page.set_default_timeout(6000)
 errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
 page.route('**/*',lambda route:route.abort())
 page.set_content(html)
 for name in ['styles.css','beta.css','recipe-workflow.css','favorite-search.css','priority-one.css','pantry-review.css']:
  page.add_style_tag(content=(ROOT/'dist-beta/app'/name).read_text())
 page.evaluate('''()=>{const store=new Map();Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)}});if(!crypto.randomUUID)crypto.randomUUID=()=> '00000000-0000-4000-8000-'+String(Math.random()).slice(2).padEnd(12,'0').slice(0,12);}''')
 page.evaluate('async()=>{'+code+'}')
 page.wait_for_function('window.ready')
 check(page.locator('#ai-setup-notice').is_visible(),'Missing AI setup has a visible settings action')
 check(page.locator('#pantry-camera').get_attribute('capture')=='environment','Take Photo requests the camera')
 check(page.locator('#pantry-gallery').get_attribute('capture') is None,'Choose Photos does not force camera capture')
 check(page.locator('#pantry-gallery').get_attribute('multiple') is not None,'Choose Photos supports multiple files')
 page.locator('#pantry-gallery').set_input_files([photo('fridge.png'),photo('pantry.png')])
 check(page.locator('#pantry-photos li').count()==2,'Gallery retains two selected photos')
 page.locator('[data-pantry="interpret"]').click();page.wait_for_function("document.querySelector('#pantry-status').textContent.includes('Choose an AI')")
 check(page.evaluate('window.uploads.length')==0 and page.evaluate('window.calls.length')==0,'No upload or AI request without chosen provider')
 page.locator('#ai-setup-notice [data-open-ai-settings]').click()
 check(page.evaluate('document.body.dataset.appView')=='more' and page.evaluate('document.body.dataset.appSubview')=='ai-settings','Settings button opens dedicated AI Settings under More')
 check(page.locator('#beta-source').is_visible(),'Existing beta connection selector is visible in AI Settings')
 page.locator('#beta-source').select_option('hosted_openai')
 page.locator('[data-return-from-ai-settings]').click()
 check(not page.locator('#beta-source').is_visible(),'AI connection selector is hidden outside its dedicated settings screen')
 check(page.locator('#pantry-review').is_visible() and page.locator('#pantry-photos li').count()==2,'Return from settings preserves photos and working view')
 page.locator('#pantry-camera').set_input_files(photo('freezer.png'))
 check(page.locator('#pantry-photos li').count()==3,'Taking another photo appends instead of replacing')
 page.locator('#pantry-gallery').set_input_files([])
 check(page.locator('#pantry-photos li').count()==3,'Canceling selection does not clear retained photos')
 page.locator('[data-remove-pantry-photo="2"]').click()
 check(page.locator('#pantry-photos li').count()==2,'Individual remove retains other photos')
 page.screenshot(path=str(OUT/'pantry-photos-mobile.png'),full_page=True)
 page.locator('[data-pantry="interpret"]').click()
 page.wait_for_function("document.querySelectorAll('[data-pantry-row]').length===3 && !document.querySelector('[data-pantry=\"interpret\"]').disabled")
 check(page.evaluate('window.calls.length')==1 and page.evaluate('window.calls[0].body.action')=='interpret','First AI action interprets photos only')
 check(page.locator('#pantry-generate').is_disabled(),'Meal generation is disabled before confirmation')
 check(not page.locator('[data-pantry-row]').nth(2).locator('[data-row-field="included"]').is_checked(),'Uncertain food is not included automatically')
 check(page.evaluate('window.removals[0].length')==2,'Temporary cleanup receives both uploaded paths')
 check(page.locator('#pantry-photos li').count()==2,'Local previews remain available while interpretation is reviewed')
 page.screenshot(path=str(OUT/'pantry-confirmation-mobile.png'),full_page=True)
 page.locator('[data-pantry="edit"]').click()
 rows=page.locator('[data-pantry-row]')
 rows.nth(0).locator('[data-row-field="name"]').fill('Tofu')
 rows.nth(0).locator('[data-row-field="quantity"]').fill('8 oz')
 rows.nth(1).locator('[data-row-field="included"]').uncheck()
 rows.nth(2).locator('[data-row-field="name"]').fill('Plain Greek yogurt')
 rows.nth(2).locator('[data-row-field="included"]').check()
 page.locator('[data-pantry="add"]').click()
 rows.last.locator('[data-row-field="name"]').fill('Lemon')
 rows.last.locator('[data-row-field="quantity"]').fill('1')
 page.locator('[data-pantry="confirm"]').click()
 check(not page.locator('#pantry-generate').is_disabled(),'Explicit confirmation enables planning')
 page.locator('#pantry-generate').click();page.wait_for_function("document.querySelector('#pantry-status').textContent.includes('Meal plan ready')")
 body=page.evaluate('window.calls.at(-1).body')
 check(body['items']==[{'name':'Tofu','quantity':'8 oz'},{'name':'Plain Greek yogurt','quantity':''},{'name':'Lemon','quantity':'1'}],'Only included corrected foods and quantities reach generation')
 check('photoPaths' not in body and 'description' not in body,'Original images and mistaken AI names are not resent for generation')
 check(page.evaluate('window.untrusted===undefined'),'AI response is rendered as text, not executable HTML')
 page.locator('#pantry-preferences').fill('Cooking for two')
 check(page.locator('#pantry-generate').is_disabled() and not page.locator('#pantry-result').is_visible(),'Changing the request invalidates dependent results and approval')
 page.locator('#pantry-camera').set_input_files(photo('extra.png'))
 check(page.locator('#pantry-stale').is_visible(),'Changing photos requires interpretation review again')
 page.locator('[data-pantry="interpret"]').click();page.wait_for_function("!document.querySelector('[data-pantry=\"interpret\"]').disabled")
 names=page.locator('[data-row-field="name"]').evaluate_all('(inputs)=>inputs.map(x=>x.value)')
 check('Tofu' in names and 'Chicken' not in names and 'Plain Greek yogurt' in names,'Reanalysis preserves corrected identities instead of restoring AI mistakes')
 check(not page.locator('[data-pantry-row]').filter(has=page.locator('input[value="Spinach"]')).locator('[data-row-field="included"]').is_checked(),'Reanalysis preserves excluded food')
 page.evaluate('window.cleanupFail=true')
 page.locator('[data-pantry="interpret"]').click();page.wait_for_function("!document.querySelector('[data-pantry=\"interpret\"]').disabled")
 check(page.locator('[data-pantry="cleanup"]').is_visible(),'Cleanup failure has its own retry action')
 check(not page.locator('[data-pantry="interpret"]').is_disabled(),'Cleanup failure does not strand the action button')
 old_calls=page.evaluate('window.calls.length');page.evaluate('window.cleanupFail=false')
 page.locator('[data-pantry="cleanup"]').click();page.wait_for_function("document.querySelector('[data-pantry=\"cleanup\"]').hidden")
 check(page.evaluate('window.calls.length')==old_calls,'Cleanup retry makes no AI request')
 page.evaluate('window.failureMode=true')
 page.locator('[data-pantry="interpret"]').click();page.wait_for_function("!document.querySelector('[data-pantry=\"interpret\"]').disabled")
 check('Synthetic provider failure' in page.locator('#pantry-status').inner_text(),'Provider failure is actionable without losing the draft')
 check(page.locator('#pantry-photos li').count()==3,'Provider failure preserves all photos')
 page.evaluate('window.failureMode=false')
 # The browser history API runs natively; no navigation to a network URL is used.
 page.evaluate('history.back()');page.wait_for_function("document.body.dataset.appSubview==='' && document.body.dataset.appView==='plan'")
 check(True,'Browser Back returns to Plan without submitting or dropping work')
 page.locator('#plan-dinner').click();page.wait_for_function("document.body.dataset.appSubview==='pantry'")
 check(page.locator('[data-row-field="name"]').first.input_value()=='Tofu','Reopening Plan retains the edited interpretation')
 for width in [320,360,390,768,1280]:
  page.set_viewport_size({'width':width,'height':844})
  check(page.evaluate('document.documentElement.scrollWidth<=innerWidth'),f'Kitchen review has no horizontal overflow at {width}px')
 page.evaluate("window.go('plan','')");page.locator('#recreate-favorite').click()
 check(page.locator('#rw-favorite option').count()==5,'Recreate initially lists all four favorite choices')
 page.locator('#rw-description').fill('My unfinished meal description')
 page.evaluate('history.back()');page.wait_for_function("document.body.dataset.appSubview==='' && document.body.dataset.appView==='plan'")
 page.locator('#recreate-favorite').click()
 check(page.locator('#rw-description').input_value()=='My unfinished meal description','Recreate description survives browser Back and reopening')
 page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(OUT/'recreate-mobile.png'),full_page=True)
 # Entry layout uses the actual application stylesheet with a synthetic pending entry.
 page.evaluate('''()=>{window.go('entries','');document.querySelector('#ledger-list').innerHTML='<li class="ledger-item"><span class="ledger-icon">D</span><strong>Caesar salad with no croutons and 4 oz grilled chicken</strong><div class="ledger-actions"><span>Estimate pending</span><button class="ledger-edit-button">Edit</button></div><div class="ledger-estimate-retry"><span>Choose an AI provider to calculate nutrition. This entry is not included in totals yet.</span><button data-retry-estimate="synthetic">Retry estimate</button><button data-open-ai-settings>Open AI Settings</button></div></li>';const toast=document.querySelector('#toast');toast.textContent='Meal saved. Choose an AI provider, then retry this existing entry.';toast.classList.add('is-visible');}''')
 toast_box=page.locator('#toast').bounding_box();retry_box=page.locator('[data-retry-estimate]').bounding_box()
 check(toast_box['y']+toast_box['height']<=retry_box['y'],'In-flow notification cannot overlap the retry control')
 check(page.locator('#toast').evaluate("el=>getComputedStyle(el).position")=='static','Notification is not a fixed overlay')
 check(page.locator('.ledger-edit-button').evaluate('el=>el.getBoundingClientRect().height')>=44,'Edit control has a minimum 44-pixel touch height')
 page.screenshot(path=str(OUT/'entries-mobile.png'),full_page=True)
 for width in [320,360,390,768,1280]:
  page.set_viewport_size({'width':width,'height':844})
  check(page.evaluate('document.documentElement.scrollWidth<=innerWidth'),f'Pending entry has no horizontal overflow at {width}px')
 check(not errors,'No runtime page errors during synthetic UI checks: '+str(errors))
 browser.close()
(OUT/'browser-results.json').write_text(json.dumps({'scope':'Real UI modules/CSS with synthetic data and mocked storage/network; not live beta or physical-phone testing','passed':len(checks),'checks':checks},indent=2))
print(f'PASS: {len(checks)} Priority 1 browser checks')
