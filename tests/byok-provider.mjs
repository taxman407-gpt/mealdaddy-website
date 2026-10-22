import assert from 'node:assert/strict';
import {callByokProvider,validateByok} from '../supabase/functions/_shared/byok-provider.mjs';
const request={model:'host-model',store:false,input:[{role:'system',content:[{type:'input_text',text:'System rules'}]},{role:'user',content:[{type:'input_text',text:'Synthetic eggs'},{type:'input_image',image_url:'data:image/png;base64,eA=='}]}],text:{format:{schema:{type:'object',properties:{calories:{type:'number',minimum:0}},required:['calories'],additionalProperties:false}}}};
for(const provider of ['openai','anthropic','gemini']){
 let calls=0;
 const response=await callByokProvider({provider,key:'synthetic-key-not-real',model:'explicit-test-model'},request,async(url,options)=>{
  calls++;assert(!url.includes('synthetic-key'));assert(!options.body.includes('synthetic-key'));assert.equal(JSON.parse(options.body).model || url.includes('explicit-test-model'),provider==='gemini'?true:'explicit-test-model');
  if(provider==='openai')return Response.json({output:[{content:[{type:'output_text',text:'{"calories":210}'}]}]});
  if(provider==='anthropic'){assert.equal(JSON.parse(options.body).messages[0].content[1].source.media_type,'image/png');return Response.json({content:[{type:'text',text:'{"calories":210}'}],usage:{input_tokens:4,output_tokens:5}});}
  assert.equal(JSON.parse(options.body).contents[0].parts[1].inlineData.mimeType,'image/png');return Response.json({candidates:[{content:{parts:[{text:'{"calories":210}'}]}}],usageMetadata:{promptTokenCount:4,candidatesTokenCount:5}});
 });
 assert.equal(response.status,200);assert.equal((await response.json()).output[0].content[0].text,'{"calories":210}');assert.equal(calls,1);
 let failures=0;const rejected=await callByokProvider({provider,key:'synthetic-key-not-real',model:'explicit-test-model'},request,async()=>{failures++;return new Response('secret details',{status:401});});assert.equal(rejected.status,401);assert(!((await rejected.text()).includes('secret details')));assert.equal(failures,1);
}
assert.throws(()=>validateByok({provider:'best_value',key:'synthetic-key',model:'model'}));
assert.throws(()=>validateByok({provider:'openai',key:'synthetic-key',model:'https://evil.invalid'}));
console.log('BYOK providers: explicit routing, images, structured JSON, credential privacy, no fallback/retries passed.');
