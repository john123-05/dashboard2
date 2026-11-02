import { externalSupabase } from './supabase';
export type ClaimConfig={path:string;accent?:string;rotation?:number};
const configs=new Map<string,ClaimConfig>();
export const claimConfigFor=(id:string)=>configs.get(id);
export async function loadClaimConfigs(){
 const {data,error}=await externalSupabase.from('park_claim_config').select('park_id,path,config').eq('published',true).abortSignal(AbortSignal.timeout(4000));
 if(error)return;
 for(const row of data??[]){if(/^[a-z0-9][a-z0-9-]{1,69}$/.test(row.path))configs.set(row.park_id,{path:row.path,accent:row.config?.accent,rotation:row.config?.rotation});}
}
