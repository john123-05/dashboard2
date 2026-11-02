import {useEffect,useState} from 'react';
import {EXTERNAL_SUPABASE_URL,EXTERNAL_SUPABASE_ANON_KEY,supabase} from '../lib/supabase';
import {useI18n,useLocaleTag} from '../lib/i18n';
import GlassCard from './ui/GlassCard';
type Totals={net_cents:number;payments:number;refunded_cents:number};
type Report={currency:string;test_mode:boolean;real:Totals;test:Totals;as_of:string};
export default function OnlinePhotoRevenue({parkId}:{parkId:string}){
 const {t}=useI18n(),locale=useLocaleTag();
 const [data,setData]=useState<Report|null>(null),[error,setError]=useState(false),[revision,setRevision]=useState(0);
 useEffect(()=>{
  let cancelled=false;
  async function load(){
   try{
    const {data:{session}}=await supabase.auth.getSession();
    if(!session)throw new Error('Authentication required');
    const res=await fetch(`${EXTERNAL_SUPABASE_URL}/functions/v1/operator-online-photo-revenue`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`,apikey:EXTERNAL_SUPABASE_ANON_KEY},body:JSON.stringify({park_id:parkId})});
    const json=await res.json();if(!res.ok||!json.data)throw new Error('Report unavailable');
    if(!cancelled){setData(json.data);setError(false);}
   }catch{if(!cancelled)setError(true);}
  }
  void load();return()=>{cancelled=true;};
 },[parkId,revision]);
 const money=(value:number)=>new Intl.NumberFormat(locale,{style:'currency',currency:data?.currency??'USD'}).format(value/100);
 return <div className="space-y-6"><div className="flex items-center justify-between gap-4"><div><h2 className="text-[28px] font-light">{t('online_sales.title')}</h2><p className="text-sm text-slate-500">{t('online_sales.mode')}</p></div><button className="glass-button-secondary" onClick={()=>setRevision(x=>x+1)}>{t('app.refresh')}</button></div>
  {error&&<p role="alert" className="text-red-700">{t('online_sales.error')}</p>}
  {data?<><div className="grid gap-4 sm:grid-cols-2">{(['real','test'] as const).map(kind=><GlassCard key={kind}><div className="p-5"><p className="text-sm text-slate-500">{t(kind==='real'?'online_sales.real':'online_sales.tests')}</p><p className="mt-3 text-3xl font-semibold">{money(data[kind].net_cents)}</p><p className="mt-2 text-xs text-slate-500">{t('online_sales.count',{count:data[kind].payments})}</p></div></GlassCard>)}</div><GlassCard><div className="p-5"><p className="text-sm">{t('online_sales.note')}</p><p className="mt-3 text-xs text-slate-500">{t('online_sales.asof',{date:new Date(data.as_of).toLocaleString(locale)})}</p></div></GlassCard></>:!error&&<p>{t('app.loading')}</p>}
 </div>;
}
