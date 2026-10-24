import {readFileSync, writeFileSync} from 'node:fs';
import {join, dirname, normalize} from 'node:path';
const packages = ['create-checkout', 'stripe-webhook'].map(name => {
  let content = readFileSync(`supabase/functions/${name}/index.ts`, 'utf8');
  content = `import {sandboxEnv, sandboxServe} from '../_shared/billing-sandbox.mjs';\n` + content.replaceAll('Deno.env.get(', 'sandboxEnv(').replace('Deno.serve(', 'sandboxServe(');
  if (name === 'stripe-webhook') {
    const marker = '  const supabaseUrl =';
    if (!content.includes(marker)) throw new Error('Webhook verification boundary changed');
    content = content.replace(marker, '  if (event.livemode !== false) return new Response("Sandbox events only", {status:400});\n' + marker);
  }
  const files = [{name:`${name}/index.ts`, content}];
  for (let i=0; i<files.length; i++) for (const match of files[i].content.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)) {
    const path = normalize(join(dirname(files[i].name), match[1]));
    if (files.some(file => file.name === path)) continue;
    files.push({name:path, content:readFileSync(path === '_shared/billing-sandbox.mjs' ? `supabase/sandbox-functions/${path}` : `supabase/functions/${path}`, 'utf8')});
  }
  return {name:`sandbox-${name}`,entrypoint_path:`${name}/index.ts`,verify_jwt:name !== 'stripe-webhook',files};
});
writeFileSync('/tmp/mealdaddy-sandbox-billing.json', JSON.stringify(packages));
console.log('Prepared two isolated sandbox billing packages. No credentials included.');
