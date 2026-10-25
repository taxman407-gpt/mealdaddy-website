import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {join,dirname,normalize} from 'node:path';
const names=['beta-access','estimate-entry','coach-action','analyze-saved-food','adjust-leftovers','recipe-recreation','manage-byok','owner-access-status','manage-family-access','summarize-feedback','manage-referrals','owner-conversion-report','manage-welcome-template','founding-availability'];
const shared=readdirSync('supabase/functions/_shared').filter(name=>/\.(mjs|ts)$/.test(name)).map(name=>({name:`_shared/${name}`,content:readFileSync(join('supabase/functions/_shared',name),'utf8')}));
for(const file of shared){
 if(file.name==='_shared/beta-deployment.mjs')file.content=file.content.replace('= false','= true');
 // Personal BYOK is explicitly selected by a tester; cloud storage stays gated by its own secret/configuration.
 file.content=file.content.replaceAll("env('ENABLE_BYOK')", "'true'");
}
const packages=names.map(name=>{
 let content=readFileSync(`supabase/functions/${name}/index.ts`,'utf8');
 content=content.replaceAll('Deno.env.get("ENABLE_BYOK")','"true"');
 const files=[{name:`${name}/index.ts`,content}];
 for(let i=0;i<files.length;i++)for(const match of files[i].content.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)){
  const path=normalize(join(dirname(files[i].name),match[1]));
  if(files.some(file=>file.name===path))continue;
  const dependency=shared.find(file=>file.name===path);
  if(!dependency)throw new Error(`Missing dependency ${path}`);files.push(dependency);
 }
 return {name:name==='beta-access'?name:`beta-${name}`,entrypoint_path:`${name}/index.ts`,verify_jwt:name!=='founding-availability',files};
});
writeFileSync('/tmp/mealdaddy-beta-function-packages.json',JSON.stringify(packages));
console.log(`${packages.length} beta-only function packages prepared; existing production function names are excluded.`);
