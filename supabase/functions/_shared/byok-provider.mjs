// Keys remain request-local. Provider URLs are fixed; there is no fallback or retry.
export function validateByok(value) {
  if (!value || !['openai', 'anthropic', 'gemini'].includes(value.provider)) throw new Error('Select OpenAI, Anthropic, or Gemini.');
  const key = String(value.key || '').trim();
  const model = String(value.model || '').trim();
  if (key.length < 12 || key.length > 512 || /\s/.test(key)) throw new Error('Enter a valid provider API key.');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,119}$/.test(model)) throw new Error('Enter the selected provider model ID.');
  return {provider:value.provider,key,model};
}
function imageData(part) {
  const match = String(part.image_url || '').match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error('Only prepared meal images can be sent to the provider.');
  return {media:match[1],data:match[2]};
}
function portableSchema(schema) {
  if (Array.isArray(schema)) return schema.map(portableSchema);
  if (!schema || typeof schema !== 'object') return schema;
  return Object.fromEntries(Object.entries(schema).filter(([key]) => !['minimum','maximum','minLength','maxLength','minItems','maxItems'].includes(key)).map(([key,value]) => [key,portableSchema(value)]));
}
export async function callByokProvider(credentials, request, fetchImpl = fetch) {
  const {provider,key,model} = validateByok(credentials);
  if(request.tools?.length && provider!=='openai') throw new Error('This selected provider connection does not support current web search. No alternate provider was used.');
  const schema=request.text?.format?.schema;
  const maxTokens=Number.isSafeInteger(request.max_output_tokens)?Math.min(4096,Math.max(1,request.max_output_tokens)):4096;
  const system = request.input.filter(item=>item.role==='system').flatMap(item=>item.content).map(part=>part.text||'').join('\n');
  const parts = request.input.filter(item=>item.role==='user').flatMap(item=>item.content);
  let url, headers, body;
  if (provider === 'openai') {
    url='https://api.openai.com/v1/responses';
    headers={authorization:`Bearer ${key}`};
    const {reasoning,...portable}=request;
    body={...portable,model,store:false,max_output_tokens:maxTokens};
  } else if (provider === 'anthropic') {
    url='https://api.anthropic.com/v1/messages';
    headers={'x-api-key':key,'anthropic-version':'2023-06-01'};
    body={model,max_tokens:maxTokens,system,messages:[{role:'user',content:parts.map(part=>{
      if(part.type==='input_text')return {type:'text',text:part.text};
      const image=imageData(part);return {type:'image',source:{type:'base64',media_type:image.media,data:image.data}};
    })}],...(schema?{output_config:{format:{type:'json_schema',schema:portableSchema(schema)}}}:{})};
  } else {
    url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    headers={'x-goog-api-key':key};
    body={systemInstruction:{parts:[{text:system}]},contents:[{role:'user',parts:parts.map(part=>{
      if(part.type==='input_text')return {text:part.text};
      const image=imageData(part);return {inlineData:{mimeType:image.media,data:image.data}};
    })}],generationConfig:{maxOutputTokens:maxTokens,...(schema?{responseMimeType:'application/json',responseJsonSchema:schema}:{})}};
  }
  const response=await fetchImpl(url,{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(45000)});
  // Never relay a provider error body: it can contain request details or credentials.
  if(!response.ok)return new Response(JSON.stringify({error:'The selected provider rejected the request. Check its key, model, quota, and permissions.'}),{status:response.status,headers:{'content-type':'application/json'}});
  if(provider==='openai')return response;
  const data=await response.json();
  const text=provider==='anthropic'?data.content?.filter(part=>part.type==='text').map(part=>part.text).join(''):data.candidates?.[0]?.content?.parts?.filter(part=>typeof part.text==='string' && !part.thought).map(part=>part.text).join('');
  if(!text)throw new Error('The selected provider returned no usable estimate.');
  return Response.json({output:[{content:[{type:'output_text',text}]}],usage:{input_tokens:provider==='anthropic'?data.usage?.input_tokens:data.usageMetadata?.promptTokenCount,output_tokens:provider==='anthropic'?data.usage?.output_tokens:data.usageMetadata?.candidatesTokenCount}});
}
