import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { z } from 'npm:zod@4.6.7';
const schema=z.object({park:z.object({id:z.string().uuid(),name:z.string().min(1).max(150),slug:z.string().regex(/^[a-z0-9][a-z0-9-]{1,69}$/),timezone:z.string().max(80)}).strict(),operator:z.object({organization_id:z.string().uuid().optional(),new_organization_name:z.string().min(1).max(150).optional()}).strict()}).strict();
export async function handle(req:Request){
 const secret=Deno.env.get('ASSISTANT_PROVISION_SECRET');
 if(req.method!=='POST')return new Response(null,{status:405});
 const candidate=req.headers.get('x-setup-secret')??'';
 // Constant-length digest comparison. Secret configured only server to server.
 const hash=async(s:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
 const a=await hash(candidate),b=await hash(secret??'');let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];
 if(!secret||diff!==0)return Response.json({error:'Unauthorized'},{status:401});
 try{
  const raw=await req.text();if(raw.length>4096)return new Response(null,{status:413});
  const input=schema.parse(JSON.parse(raw));
  const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  const {data,error}=await db.rpc('assistant_provision_park',{p_park:input.park,p_operator:input.operator});
  if(error)return Response.json({error:'Provisioning conflict; no existing organization or user changed'},{status:409});
  return Response.json(data);
 }catch{return Response.json({error:'Invalid request'},{status:400});}
}

