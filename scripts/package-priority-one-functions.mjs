// Creates a beta-prefixed deployment package; does not deploy or change production functions.
import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, normalize} from 'node:path';
const files = [{name: 'pantry-review/index.ts', content: readFileSync('supabase/functions/pantry-review/index.ts', 'utf8')}];
for (let i = 0; i < files.length; i++) {
  for (const match of files[i].content.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)) {
    const name = normalize(join(dirname(files[i].name), match[1]));
    if (!name.startsWith('_shared/')) throw new Error(`Unexpected pantry dependency: ${name}`);
    if (files.some(file => file.name === name)) continue;
    let content = readFileSync('supabase/functions/' + name, 'utf8');
    if (name === '_shared/beta-deployment.mjs') content = content.replace('= false', '= true');
    content = content.replaceAll("env('ENABLE_BYOK')", "'true'");
    files.push({name, content});
  }
}
writeFileSync('/tmp/mealdaddy-priority-one-function.json', JSON.stringify({name: 'beta-pantry-review', entrypoint_path: 'pantry-review/index.ts', verify_jwt: true, files}));
console.log('Prepared beta-pantry-review package only. No deployment performed.');
