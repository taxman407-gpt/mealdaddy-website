from pathlib import Path
from playwright.sync_api import sync_playwright
import json,re,os,shutil
BASE=Path(__file__).resolve().parents[1];OUT=Path(os.environ.get('MEALDADDY_TEST_OUTPUT',str(BASE/'.artifacts/recipe-workflow')));OUT.mkdir(parents=True,exist_ok=True)
core=(BASE/'app/recipe-workflow-core.mjs').read_text().replace('export ','')
ui=(BASE/'app/recipe-workflow.mjs').read_text();ui=ui[ui.index('\n')+1:].replace('export function','function')
ui=re.sub(r"  const style = document.createElement\('link'\);.*?document.head.append\(style\);\n",'',ui)
ui=ui.replace('location.href',"'https://fixture.invalid/app/app.html'")
fixture=(BASE/'tests/recipe-workflow-browser.html').read_text()
html=fixture.split('<script type="module">')[0]+'</body></html>'
script=fixture.split('<script type="module">')[1].split('</script>')[0]
script=script[script.index('\n',script.index('import '))+1:]
script=script.replace("new URLSearchParams(location.search).get('user')||'synthetic-a'","window.fixtureUser")
css=(BASE/'app/recipe-workflow.css').read_text()
checks=[]
def check(value,label):
    assert value,label
    checks.append(label)
def mount(page,user='synthetic-a',store=None):
    page.set_content(html)
    page.add_style_tag(content=css)
    page.evaluate('''({user,store})=>{window.fixtureUser=user;window.fixtureStore=store||{};
      Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>window.fixtureStore[k]||null,setItem:(k,v)=>window.fixtureStore[k]=v,removeItem:k=>delete window.fixtureStore[k]}});
      window.history.replaceState=(_,__,url)=>{window.mockHash=url;};
      const create=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{window.exportedBlob=blob;return create(blob);};
    }''',{'user':user,'store':store})
    code=core+'\nconst e=escapeHtml;\n'+ui.replace('location.hash','(window.mockHash || "")')+'\n'+script
    page.evaluate('()=>{'+code+'}')
with sync_playwright() as p:
    executable=os.environ.get('CHROMIUM_EXECUTABLE') or shutil.which('chromium')
    launch={'headless':True}
    if executable: launch['executable_path']=executable
    browser=p.chromium.launch(**launch)
    ctx=browser.new_context(viewport={'width':390,'height':844})
    page=ctx.new_page();errors=[];page.on('pageerror',lambda err:errors.append(str(err)));mount(page)
    page.click('#recreate-favorite')
    check(page.evaluate('window.nativeClicks')==0,'native launcher intercepted once')
    page.select_option('#rw-favorite','saved-meal-1');check(page.input_value('#rw-description')=='Lemon chicken with vegetables','favorite description selected')
    page.click('#rw-next');check(page.evaluate('window.calls.length')==0,'confirmation precedes AI request')
    page.click('[data-rw="generate"]');page.wait_for_selector('.rw-recipe');check(page.evaluate('window.calls[0].name')=='recipe-recreation','existing recipe endpoint adapter invoked')
    page.click('[data-rw="favorite"]');page.click('[data-rw="favorite"]')
    state=page.evaluate("JSON.parse(window.fixtureStore['mealdaddy-recipe-workflow-v1:synthetic-a'])")
    check(len(state['recipes'])==1 and state['recipes'][0]['favorite'],'idempotent favorite save')
    page.click('[data-rw="add-shopping"]');check(page.locator('#rw-shopping').is_visible(),'explicit shopping transition')
    onion=page.locator('[data-row="0"]');onion.locator('[data-row-field="onHand"]').fill('1');check(onion.locator('.rw-buy strong').inner_text()=='1','confirmed stock deducted')
    onion.locator('[data-row-field="override"]').fill('Buy 1 bag');onion.locator('[data-row-field="checked"]').check();onion.locator('.rw-source-links a').click()
    check(page.locator('[data-source]').get_attribute('open') is not None,'item source link opens editable source')
    page.locator('[data-source-field="description"]').fill('Edited general description for this shopping list.')
    page.locator('[data-source-field="ingredients"]').fill('3 | Onion\n1 tbsp | Olive oil\nto taste | Rosemary')
    check(page.locator('#rw-shopping > .rw-stale').is_visible(),'source edit shows stale-list warning')
    page.click('[data-rw="refresh-list"]');onion=page.locator('[data-row="0"]')
    check(onion.locator('[data-row-field="override"]').input_value()=='Buy 1 bag' and onion.locator('[data-row-field="checked"]').is_checked(),'refresh preserves manual quantity and shopping checkmark')
    check(onion.locator('.rw-stale').is_visible(),'preserved edits flagged after required quantity changes')
    page.click('[data-rw="shopping-text"]');text=page.evaluate('window.exportedBlob.text()');(OUT/'shopping-list-test.txt').write_text(text)
    check('Edited general description' in text and 'shopping-source=recipe-fixture-recipe-1' in text,'text export includes descriptions and links')
    for w in [360,390,768,1280]:
        page.set_viewport_size({'width':w,'height':900});check(page.evaluate('document.documentElement.scrollWidth<=innerWidth'),'shopping no overflow '+str(w))
    page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(OUT/'shopping-mobile.png'),full_page=True)
    page.click('[data-rw="shopping-print"]');check(page.evaluate('window.printCount')==1,'print route invoked');page.pdf(path=str(OUT/'shopping-list-test.pdf'),format='Letter',print_background=True)
    page.evaluate("document.body.classList.remove('rw-printing');document.querySelector('#rw-print-root')?.remove()")
    stored=page.evaluate('window.fixtureStore')
    other=ctx.new_page();mount(other,'synthetic-b',stored);other.click('[data-rw-shopping-launch]');check(other.locator('[data-source]').count()==0,'device storage keys are account scoped (mock storage)')
    reload_page=ctx.new_page();mount(reload_page,'synthetic-a',stored);reload_page.click('[data-rw-shopping-launch]');check(reload_page.locator('[data-row="0"] [data-row-field="override"]').input_value()=='Buy 1 bag','remount restores saved list (mock storage)')
    page.click('#recreate-favorite');page.click('[data-rw="start-over"]');page.click('[data-mode="restaurant"]');page.fill('#rw-description','46140 Test Kitchen lemon chicken');page.click('#rw-next');page.wait_for_selector('.rw-cards article')
    check(page.evaluate('window.calls[1].name')=='coach-action' and page.evaluate('window.calls[1].body.mode')=='restaurant','menu search reuses Restaurant Mode adapter')
    check(not page.evaluate('Boolean(window.pwned)') and page.locator('a[href^="javascript:"]').count()==0,'untrusted menu markup and unsafe URLs blocked')
    page.click('[data-rw="choose"][data-index="0"]');page.uncheck('[data-substitution="1"]');page.click('[data-rw="generate"]');page.wait_for_selector('.rw-recipe')
    source=page.evaluate('window.calls[2].body.source');check('Use olive oil' in source and 'Leave out croutons' not in source,'only confirmed substitutions transmitted')
    for w in [360,390,768,1280]:
        page.set_viewport_size({'width':w,'height':900});check(page.evaluate('document.documentElement.scrollWidth<=innerWidth'),'recipe no overflow '+str(w))
    page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(OUT/'recipe-mobile.png'),full_page=True)
    page.click('[data-rw="edit-confirmed"]');page.fill('#rw-confirm-description','x'*501);page.click('[data-rw="generate"]');check(page.evaluate('window.calls.length')==3,'overlength description blocked without truncation')
    check('nothing has been sent or cut off' in page.locator('#rw-recreate .rw-status').inner_text(),'overlength error explained')
    page.click('#sign-out');check(page.locator('#rw-recreate').inner_text()=='' and page.locator('#rw-shopping').inner_text()=='','signout clears visible data')
    check(not errors,'no browser runtime errors')
    browser.close()
(OUT/'browser-results.json').write_text(json.dumps({'fixture':'inline Chromium; mock API, storage and history; no live network or backend','passed':len(checks),'checks':checks},indent=2))
print('PASS:',len(checks),'inline synthetic-browser checks')
