import {useEffect,useState} from 'react';
import {useI18n,useLocaleTag} from '../lib/i18n';
import GlassCard from './ui/GlassCard';
type Photo={code:string;preview_url:string;claim_url:string;captured_at:string};
export default function OnlinePhotos(){
 const {t}=useI18n(),locale=useLocaleTag();
 const [photos,setPhotos]=useState<Photo[]>([]),[error,setError]=useState(false),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0);
 useEffect(()=>{
  let cancelled=false;
  async function load(){try{
   const response=await fetch('https://kvpcwlcfgmsmarjtwpsx.supabase.co/functions/v1/online-photo-sales/gallery',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:'kalahari-virginia'})});
   const data=await response.json();if(!response.ok)throw new Error('Unavailable');
   if(!cancelled){setPhotos(data.photos);setError(false);}
  }catch{if(!cancelled)setError(true);}finally{if(!cancelled)setLoading(false);}}
  void load();const timer=setInterval(()=>void load(),20000);return()=>{cancelled=true;clearInterval(timer);};
 },[revision]);
 return <div className="space-y-6"><header className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-4"><img src="/shop-brands/kalahari-logo-white.webp" alt="Kalahari Resorts" className="w-36 rounded-lg bg-[#002858] p-3"/><div><h2 className="text-[28px] font-light">{t('photos.title')}</h2><p className="text-sm text-slate-500">{t('online_photos.note')}</p></div></div><button className="glass-button-secondary" onClick={()=>setRevision(x=>x+1)}>{t('app.refresh')}</button></header>
  <GlassCard><div className="flex flex-wrap gap-4 p-5"><a className="glass-button-primary" href="https://liftpictures-fotos.de/kalahari-virginia/screen" target="_blank" rel="noreferrer">{t('online_photos.screen')} ↗</a><a className="glass-button-secondary" href="https://liftpictures-fotos.de/kalahari-virginia/shop" target="_blank" rel="noreferrer">{t('photo_shop.open')} ↗</a></div></GlassCard>
  {error&&<p role="alert">{t('online_sales.error')}</p>}{loading&&<p>{t('app.loading')}</p>}
  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{photos.map(p=><a key={p.code} href={p.claim_url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-xl border bg-white"><img src={p.preview_url} alt={t('photos.title')} className="aspect-[4/3] w-full bg-slate-100 object-contain" loading="lazy"/><div className="flex items-center justify-between gap-3 p-3 text-xs"><code>{p.code}</code><time>{new Date(p.captured_at).toLocaleString(locale,{timeZone:'America/New_York'})}</time></div></a>)}</div>
  {!loading&&!error&&!photos.length&&<p>{t('online_photos.empty')}</p>}
 </div>;
}
