"""Inline local ESM fixtures for a browser sandbox with navigation disabled.
Storage is explicitly mocked; application modules and their DOM behavior are real.
"""
from pathlib import Path
import re,json

def inline_modules(root, entry):
    built=[];seen={}
    pattern=re.compile(r'^import\s*\{([\s\S]*?)\}\s*from\s*[\"\']([^\"\']+)[\"\'];?\s*',re.M)
    def replacements(match,path):
        target=match.group(2).split('?')[0]
        child=(root/target.lstrip('/')) if target.startswith('/') else path.parent/target
        symbol=load(child.resolve())
        names=re.sub(r'\s+as\s+',':',match.group(1))
        return f'const {{{names}}}={symbol};\n'
    def load(path):
        if path in seen:return seen[path]
        symbol=f'__md_module_{len(seen)}';seen[path]=symbol
        if path.name=='saved-foods-store.js':
            source="""
const rows=new Map();
const getDeviceSavedFoods=async id=>[...(rows.get(id)||[])];
const getCachedSyncedFoods=async()=>[];
const saveDeviceFood=async(id,food)=>{rows.set(id,[...(rows.get(id)||[]),{...food,storage_scope:'device'}]);return food;};
const replaceSyncedFoodCache=async()=>{};const updateSyncedFoodCache=async()=>{};
const deleteLocalSavedFood=async()=>{};const getSavedFoodStorageMode=()=> 'device_only';
const setSavedFoodStorageMode=(_,mode)=>mode;
const requestPersistentDeviceStorage=async()=>({supported:false,persistent:false});
"""
            exports=['getDeviceSavedFoods','getCachedSyncedFoods','saveDeviceFood','replaceSyncedFoodCache','updateSyncedFoodCache','deleteLocalSavedFood','getSavedFoodStorageMode','setSavedFoodStorageMode','requestPersistentDeviceStorage']
        else:
            source=path.read_text()
            source=pattern.sub(lambda m:replacements(m,path),source)
            exports=re.findall(r'export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)',source)
            aliases=[]
            def export_alias(m):
                for part in m.group(1).split(','):
                    bits=part.strip().split(' as ')
                    if bits[0]:aliases.append(f'{bits[-1]}:{bits[0]}')
                return ''
            source=re.sub(r'export\s*\{([^}]+)\};?',export_alias,source)
            source=re.sub(r'\bexport\s+','',source)
            exports+=aliases
            source=source.replace('import.meta.url',json.dumps('https://fixture.invalid/app/'+path.name))
            source=source.replace('location.href',json.dumps('https://fixture.invalid/app/app.html'))
        built.append(f'const {symbol}=(()=>{{\n{source}\nreturn {{{",".join(exports)}}};\n}})();')
        return symbol
    main=pattern.sub(lambda m:replacements(m,root/'fixture.html'),entry)
    return '\n'.join(built)+'\n'+main
