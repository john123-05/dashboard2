import Stripe from 'https://esm.sh/stripe@17.7.0?target=deno';
import { supabaseService as db, handleOptions, json, requireAdminFromRequest } from '../_shared/sameProjectAdminAuth.ts';
import { requireOperatorForPark, canViewInternalCosts } from '../_shared/operatorAuth.ts';
import { productCostSnapshot } from '../_shared/photoProductCosts.ts';
import { PLOSE_ID, PHOTO_PRODUCTS, PHONE_MODELS, COUNTRIES, normalizeCart, cents, calculateMargin } from '../_shared/photoProductCatalog.ts';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const TOKEN=/^[a-f0-9]{64}$/;
const bucket='photo-product-originals';
const base=Deno.env.get('SUPABASE_URL')!+'/functions/v1/photo-product-shop';
const key=Deno.env.get('SHOP_STRIPE_SECRET_KEY')||Deno.env.get('STRIPE_SECRET_KEY')||'';
const testKey=key.startsWith('sk_test_')||key.startsWith('rk_test_');
const stripe=new Stripe(testKey?key:'sk_test_unconfigured',{apiVersion:'2024-06-20'});
const providerCache=new Map<string,{at:number,value:any}>();
const imageCache=new Map<string,{width:number;height:number}>();
function must(value:unknown,message:string,status=400):asserts value {if(!value)throw Object.assign(new Error(message),{status});}
function checked(result:any){if(result.error)throw new Error('Daten konnten nicht verarbeitet werden.');return result.data;}
async function hash(s:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
function random(){return [...crypto.getRandomValues(new Uint8Array(32))].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function provider(path:string,body?:unknown,sandbox=false){
 const secret=Deno.env.get(sandbox?'PRODIGI_SANDBOX_API_KEY':'PRODIGI_CATALOG_API_KEY');
 must(secret,sandbox?'Prodigi-Testzugang fehlt noch.':'Produktkatalog ist noch nicht verbunden.',503);
 // Live credentials are used for read-only product and quote requests only.
 must(sandbox||path.startsWith('/products/')||path==='/quotes','Live-Druckaufträge sind gesperrt.',403);
 const res=await fetch(`https://${sandbox?'api.sandbox.prodigi.com':'api.prodigi.com'}/v4.0${path}`,{
  method:body===undefined?'GET':'POST', headers:{'X-API-Key':secret,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(25000),
 });
 const data=await res.json().catch(()=>null);
 if(!res.ok)console.error('Prodigi request rejected',res.status,Object.keys(data?.failures||{}));
 must(res.ok&&data&&!data.outcome?.toLowerCase().includes('fail'),'Der Druckanbieter konnte die Anfrage nicht bestätigen.',502);
 return data;
}
async function details(sku:string){const entry=providerCache.get(sku);if(entry&&Date.now()-entry.at<3600000)return entry.value;const value=(await provider('/products/'+encodeURIComponent(sku))).product;must(value,'Produkt derzeit nicht verfügbar.',409);providerCache.set(sku,{at:Date.now(),value});return value;}
async function rate(req:Request,scope:string,limit=30){
 const ip=req.headers.get('cf-connecting-ip')||req.headers.get('x-forwarded-for')?.split(',')[0]||'unknown';
 const fingerprint=await hash(scope+':'+ip);
 const {count,error}=await db.from('photo_product_request_limits').select('id',{count:'exact',head:true}).eq('fingerprint',fingerprint).gt('created_at',new Date(Date.now()-600000).toISOString());
 must(!error,'Anfrage momentan nicht möglich.',503);must((count||0)<limit,'Bitte kurz warten und erneut versuchen.',429);
 checked(await db.from('photo_product_request_limits').insert({fingerprint}));
}
async function shop(){const s=checked(await db.from('park_photo_product_shops').select('*').eq('park_id',PLOSE_ID).single());must(s?.enabled&&s.mode==='sandbox','Shop derzeit nicht verfügbar.',503);return s;}
function products(s:any){return PHOTO_PRODUCTS.map(p=>({...p,price_cents:Number.isInteger(s.prices[p.key])&&s.prices[p.key]>=50?s.prices[p.key]:p.price_cents}));}
function publicProduct(p:any){const {sku,attributes,...rest}=p;return {...rest,models:p.models?.map((m:any)=>({label:m.label}))};}
async function photo(id:string){must(UUID.test(id),'Foto nicht verfügbar.',404);const p=checked(await db.from('photos').select('id,storage_bucket,storage_path,captured_at,source_file_code').eq('id',id).eq('park_id',PLOSE_ID).eq('is_test',false).maybeSingle());must(p,'Foto nicht mehr verfügbar.',404);return p;}
function photoNumber(p:any){return p.source_file_code||p.id.slice(0,6).toUpperCase();}
function parkTime(day:string,time='00:00'){
 const target=Date.parse(day+'T'+time+':00Z');let t=target;
 for(let i=0;i<3;i++){const local=new Date(new Date(t).toLocaleString('en-US',{timeZone:'Europe/Rome'})),utc=new Date(new Date(t).toLocaleString('en-US',{timeZone:'UTC'}));t=target+(+utc-+local);}
 return t;
}
async function imageSize(p:any){
 if(imageCache.has(p.id))return imageCache.get(p.id)!;
 const path=[p.storage_bucket,...p.storage_path.split('/')].map(encodeURIComponent).join('/');
 const r=await fetch(Deno.env.get('SUPABASE_URL')+'/storage/v1/object/'+path,{headers:{Authorization:'Bearer '+Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),Range:'bytes=0-262143'},signal:AbortSignal.timeout(15000)});
 must(r.ok,'Originalfoto derzeit nicht verfügbar.',409);const b=new Uint8Array(await r.arrayBuffer());let size:null|{width:number;height:number}=null;
 if(b[0]===137&&b[1]===80&&b.length>=24){const v=new DataView(b.buffer);size={width:v.getUint32(16),height:v.getUint32(20)};}
 if(b[0]===255&&b[1]===216){let i=2;while(i+8<b.length){if(b[i]!==255){i++;continue;}const marker=b[i+1];if(marker===218||marker===217)break;const length=(b[i+2]<<8)+b[i+3];if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){size={height:(b[i+5]<<8)+b[i+6],width:(b[i+7]<<8)+b[i+8]};break;}if(length<2)break;i+=2+length;}}
 must(size&&size.width>0&&size.height>0,'Die Bildauflösung konnte nicht geprüft werden.',409);if(imageCache.size>256)imageCache.clear();imageCache.set(p.id,size);return size;
}
async function preview(req:Request,id:string){
 const p=await photo(id);const {data,error}=await db.storage.from(p.storage_bucket).download(p.storage_path,{transform:{width:800,height:800,resize:'contain',quality:65}});
 must(!error&&data,'Vorschaubild nicht verfügbar.',404);
 const bytes=new Uint8Array(await data.arrayBuffer());const mime=bytes[0]===255&&bytes[1]===216?'image/jpeg':bytes[0]===137&&bytes[1]===80?'image/png':null;must(mime,'Vorschaubild nicht verfügbar.',404);
 return new Response(bytes,{headers:{'Content-Type':mime,'Cache-Control':'private,max-age=120','Access-Control-Allow-Origin':'*','X-Content-Type-Options':'nosniff'}});
}
async function makeQuote(req:Request,body:any){
 await rate(req,'quote');const s=await shop();let items;try{items=normalizeCart(body.items);}catch(e){throw Object.assign(e as Error,{status:400});}const country=String(body.country||'');must(Object.hasOwn(COUNTRIES,country),'Bitte ein verfügbares Lieferland wählen.');
 const available=products(s);const cart=[];
 for(const item of items){
  const p=available.find(p=>p.key===item.key)!;const ph=await photo(item.photoId);
  const sku=item.key==='phonecase'?PHONE_MODELS.find(([label])=>label===item.model)![1]:p.sku;
  let dimensions=null;let attrs:any=p.attributes;
  if(sku){const info=await details(sku);
   // Match configured attributes without trusting any client-supplied SKU.
   const selected=info.variants.find((v:any)=>v.shipsTo?.includes(country)&&Object.entries(p.attributes).every(([k,value])=>v.attributes?.[k]===value));
   must(selected,'Dieses Produkt ist für das Lieferland nicht verfügbar.',409);dimensions=selected.printAreaSizes?.default;attrs=selected.attributes;
  }
  const sourceSize=sku?await imageSize(ph):null;
  const scale=dimensions&&sourceSize?(item.sizing==='fillPrintArea'?Math.max:Math.min)(dimensions.horizontalResolution/sourceSize.width,dimensions.verticalResolution/sourceSize.height):1;
  const effectiveDpi=sku?Math.round(300/scale):null;
  must(!sku||Number(effectiveDpi)>=72,'Der gewählte Zuschnitt hat zu wenig Auflösung. Bitte „Ganzes Foto“ oder ein kleineres Produkt wählen.',409);
  cart.push({...item,label:p.label,unit_price_cents:p.price_cents,sku,attributes:attrs,dimensions,sourceSize,effectiveDpi,number:photoNumber(ph)});
 }
 const physical=cart.filter(x=>x.sku);
 const result=physical.length?await provider('/quotes',{shippingMethod:'Standard',destinationCountryCode:country,currencyCode:'EUR',items:physical.map(x=>({sku:x.sku,copies:x.quantity,attributes:x.attributes,assets:[{printArea:'default'}]}))}):{quotes:[{costSummary:{items:{amount:0},shipping:{amount:0},totalTax:{amount:0},totalCost:{amount:0}},shipments:[]}]};
 const q=result.quotes?.find((x:any)=>x.shipmentMethod==='Standard')||result.quotes?.[0];must(q?.costSummary,'Kein Versandangebot verfügbar.',409);
 const vat=COUNTRIES[country as keyof typeof COUNTRIES].vat;
 const production=cents(q.costSummary.items.amount), shipping=cents(q.costSummary.shipping.amount), supplierTax=cents(q.costSummary.totalTax?.amount||0), supplierTotal=cents(q.costSummary.totalCost.amount);
 // Pass shipping through including destination VAT, rounded up to 10 cents.
 const shippingGross=Math.ceil(shipping*(1+vat)/10)*10;
 const subtotal=cart.reduce((n,x)=>n+x.unit_price_cents*x.quantity,0);const total=subtotal+shippingGross;
 must(total>=50&&total<=200000,'Warenkorb zu groß.');
 const totals={subtotal_cents:subtotal,shipping_cents:shippingGross,total_cents:total,vat_rate:vat,vat_cents:Math.round(total-total/(1+vat)),supplier_production_cents:production,supplier_shipping_cents:shipping,supplier_tax_cents:supplierTax,supplier_total_cents:supplierTotal};
 const token=random();const row=checked(await db.from('photo_product_quotes').insert({park_id:PLOSE_ID,token_hash:await hash(token),country,items:cart,supplier_quote:q,totals}).select('id,expires_at').single());
 return {...row,token,...publicQuote(row,totals,q),items:cart.map(({sku,attributes,...x})=>x)};
}
function publicQuote(row:any,t:any,q:any){return {id:row.id,expires_at:row.expires_at,subtotal_cents:t.subtotal_cents,shipping_cents:t.shipping_cents,total_cents:t.total_cents,vat_cents:t.vat_cents,vat_rate:t.vat_rate,shipments:(q.shipments||[]).map((x:any)=>({country:x.fulfillmentLocation?.countryCode,carrier:x.carrier?.name,service:x.carrier?.service})),is_test:true};}
async function quoteFor(body:any){must(UUID.test(body.quoteId||'')&&TOKEN.test(body.token||''),'Warenkorb bitte erneut berechnen.',403);const q=checked(await db.from('photo_product_quotes').select('*').eq('id',body.quoteId).eq('park_id',PLOSE_ID).maybeSingle());must(q&&q.token_hash===await hash(body.token),'Warenkorb nicht verfügbar.',403);return q;}
function returnAddress(raw:unknown){
 const u=new URL(String(raw));const local=['localhost','127.0.0.1'].includes(u.hostname)&&u.protocol==='http:';
 must(local||(u.protocol==='https:'&&['liftpictures-fotos.de','www.liftpictures-fotos.de','dashboard-liftpictures.com','www.dashboard-liftpictures.com'].includes(u.hostname)),'Ungültige Rücksprungadresse.');
 must(u.pathname==='/plose/shop'||u.pathname==='/demo-shop/a675c745-91a0-4ae3-be49-c15c6a37967e','Ungültige Shop-Adresse.');return u.origin+u.pathname;
}
async function checkout(body:any){
 must(testKey,'Stripe-Testzahlung ist noch nicht verbunden.',503);await shop();const q=await quoteFor(body);must(Date.parse(q.expires_at)>Date.now(),'Versandangebot abgelaufen. Bitte neu berechnen.',409);
 const back=returnAddress(body.returnUrl);
 for(const item of q.items)await photo(item.photoId);
 let order=checked(await db.from('photo_product_orders').select('*').eq('quote_id',q.id).maybeSingle());
 if(!order)order=checked(await db.from('photo_product_orders').upsert({park_id:PLOSE_ID,quote_id:q.id,token_hash:q.token_hash,items:q.items,totals:q.totals,country:q.country},{onConflict:'quote_id',ignoreDuplicates:true}).select('*').maybeSingle())||checked(await db.from('photo_product_orders').select('*').eq('quote_id',q.id).single());
 if(order.stripe_session_id){const old=await stripe.checkout.sessions.retrieve(order.stripe_session_id);if(old.status==='open'&&old.url)return {url:old.url,orderId:order.id};must(old.payment_status!=='paid','Dieser Warenkorb wurde bereits bezahlt.',409);must(false,'Zahlungssitzung abgelaufen. Bitte ein neues Versandangebot berechnen.',409);}
 const hasPhysical=q.items.some((x:any)=>x.sku);
 const session=await stripe.checkout.sessions.create({mode:'payment',payment_method_types:['card'],locale:'de',line_items:q.items.map((x:any)=>({quantity:x.quantity,price_data:{currency:'eur',unit_amount:x.unit_price_cents,product_data:{name:x.label+(x.model?' · '+x.model:''),description:'Plosebob · Foto '+x.number+' · Testbestellung'}}})),
  ...(hasPhysical?{shipping_address_collection:{allowed_countries:[q.country]},shipping_options:[{shipping_rate_data:{display_name:'Versand nach Hause',type:'fixed_amount',fixed_amount:{amount:q.totals.shipping_cents,currency:'eur'}}}]}:{}),
  billing_address_collection:'required',metadata:{photo_product_order:order.id,park_id:PLOSE_ID,is_test:'true'},
  success_url:back+'?order='+order.id+'#access='+body.token,cancel_url:back+'?cancelled=1',expires_at:Math.floor(Date.now()/1000)+1800,
 },{idempotencyKey:'photo-products-'+order.id});
 must(!session.livemode&&session.url,'Testzahlung konnte nicht erstellt werden.',502);
 checked(await db.from('photo_product_orders').update({stripe_session_id:session.id}).eq('id',order.id));return {url:session.url,orderId:order.id};
}
async function verifiedOrder(body:any){must(UUID.test(body.orderId||'')&&TOKEN.test(body.token||''),'Bestellzugang ungültig.',403);const row=checked(await db.from('photo_product_orders').select('*').eq('id',body.orderId).eq('park_id',PLOSE_ID).maybeSingle());must(row&&row.token_hash===await hash(body.token),'Bestellung nicht verfügbar.',403);return row;}
async function refreshPayment(order:any){
 if(order.status!=='awaiting_payment'||!order.stripe_session_id)return order;
 const s=await stripe.checkout.sessions.retrieve(order.stripe_session_id);
 must(!s.livemode&&s.metadata?.photo_product_order===order.id&&s.metadata?.park_id===PLOSE_ID&&s.currency==='eur'&&s.amount_total===order.totals.total_cents,'Zahlung konnte nicht zugeordnet werden.',409);
 if(s.status==='expired'){checked(await db.from('photo_product_orders').update({status:'expired'}).eq('id',order.id).eq('status','awaiting_payment'));return {...order,status:'expired'};}
 if(s.payment_status!=='paid')return order;
 const shipping=s.shipping_details;must(!order.items.some((x:any)=>x.sku)||shipping?.address?.country===order.country,'Lieferadresse passt nicht zum Angebot.',409);
 const recipient={name:shipping?.name||s.customer_details?.name,email:s.customer_details?.email,address:shipping?.address||s.customer_details?.address};
 const saved=checked(await db.from('photo_product_orders').update({status:'paid',recipient,paid_at:new Date().toISOString()}).eq('id',order.id).eq('status','awaiting_payment').select('*').maybeSingle());return saved||checked(await db.from('photo_product_orders').select('*').eq('id',order.id).single());
}
async function original(order:any,index:number){
 const item=order.items[index];must(item,'Foto nicht verfügbar.',404);
 const path=`${order.id}/${index}.jpg`;
 // Signing does not check existence in every Storage version; list exact name.
 const files=checked(await db.storage.from(bucket).list(order.id,{search:index+'.jpg',limit:10}));
 if(!files.some((x:any)=>x.name===index+'.jpg')){
  const p=await photo(item.photoId);const downloaded=await db.storage.from(p.storage_bucket).download(p.storage_path);must(!downloaded.error&&downloaded.data,'Originaldatei nicht mehr verfügbar.',409);
  must(downloaded.data.size<=25000000,'Originaldatei ist zu groß.',409);
  const bytes=new Uint8Array(await downloaded.data.arrayBuffer());
  const mime=bytes[0]===255&&bytes[1]===216?'image/jpeg':bytes[0]===137&&bytes[1]===80?'image/png':null;
  must(mime,'Originaldatei hat kein unterstütztes Bildformat.',409);
  // Legacy uploads may be stored as application/octet-stream. Detect the real
  // image type instead of copying that metadata into the private print bucket.
  const up=await db.storage.from(bucket).upload(path,bytes,{contentType:mime,upsert:false});if(up.error&&!String(up.error.message).toLowerCase().includes('exist'))throw new Error('Druckdatei konnte nicht gesichert werden.');
 }
 return checked(await db.storage.from(bucket).createSignedUrl(path,86400,{download:'Plosebob-Foto.jpg'})).signedUrl;
}
async function syncProvider(order:any){
 if(!order.provider_order_id)return order;
 const p=(await provider('/orders/'+encodeURIComponent(order.provider_order_id),undefined,true)).order;
 must(p?.merchantReference==='LP-'+order.id,'Druckauftrag konnte nicht zugeordnet werden.',409);
 const status=p.status?.stage==='Complete'?'shipped':p.status?.stage==='Cancelled'?'cancelled':'processing';
 const snapshot={stage:p.status?.stage,issues:p.status?.issues||[],shipments:(p.shipments||[]).map((s:any)=>({carrier:s.carrier?.name,tracking_number:s.tracking?.number||s.tracking?.trackingNumber,tracking_url:s.tracking?.url||s.tracking?.trackingUrl,dispatch_date:s.dispatchDate,fulfillment_country:s.fulfillmentLocation?.countryCode}))};
 if(snapshot.issues.length) return checked(await db.from('photo_product_orders').update({status:'needs_attention',provider_status:snapshot,error_code:'provider_issue',updated_at:new Date().toISOString()}).eq('id',order.id).select('*').single());
 return checked(await db.from('photo_product_orders').update({status,provider_status:snapshot,error_code:null,updated_at:new Date().toISOString()}).eq('id',order.id).select('*').single());
}
async function fulfill(order:any){
 if(order.provider_order_id)return syncProvider(order);
 if(!['paid','awaiting_connection'].includes(order.status))return order;
 const physical=order.items.map((x:any,index:number)=>({...x,index})).filter((x:any)=>x.sku);
 if(!physical.length)return checked(await db.from('photo_product_orders').update({status:'ready'}).eq('id',order.id).select('*').single());
 if(!Deno.env.get('PRODIGI_SANDBOX_API_KEY'))return checked(await db.from('photo_product_orders').update({status:'awaiting_connection',error_code:'sandbox_not_connected'}).eq('id',order.id).select('*').single());
 const locked=checked(await db.from('photo_product_orders').update({dispatch_started_at:new Date().toISOString(),status:'submitting'}).eq('id',order.id).is('dispatch_started_at',null).select('*').maybeSingle());if(!locked)return checked(await db.from('photo_product_orders').select('*').eq('id',order.id).single());
 let step='address';
 try{
  const address=order.recipient?.address;must(address?.line1&&address?.city&&address?.postal_code,'Lieferadresse unvollständig.',409);
  const items=[];
  step='original';for(const x of physical)items.push({merchantReference:String(x.index),sku:x.sku,copies:x.quantity,sizing:x.sizing,attributes:x.attributes,recipientCost:{amount:(x.unit_price_cents/100).toFixed(2),currency:'EUR'},assets:[{printArea:'default',url:await original(order,x.index)}]});
  // This function has no code path capable of creating a live Prodigi order.
  step='provider';const result=await provider('/orders',{idempotencyKey:order.id,merchantReference:'LP-'+order.id,shippingMethod:'Standard',callbackUrl:base+'/callback',recipient:{name:order.recipient.name,email:order.recipient.email,address:{line1:address.line1,...(address.line2?{line2:address.line2}:{}),postalOrZipCode:address.postal_code,countryCode:address.country,townOrCity:address.city,...(address.state?{stateOrCounty:address.state}:{})}},items,metadata:{park_id:PLOSE_ID,liftpictures_order:order.id,test:true}},true);
  must(result.order?.id,'Druckauftrag wurde nicht bestätigt.',502);
  order=checked(await db.from('photo_product_orders').update({provider_order_id:result.order.id,status:'processing',error_code:null}).eq('id',order.id).select('*').single());
  return await syncProvider(order);
 }catch{
  // Keep the lock: a network failure can mean that the provider accepted the
  // order. Never silently retry a possibly successful physical order.
  console.error('photo-products fulfilment failed at',step);
  return checked(await db.from('photo_product_orders').update({status:'needs_attention',error_code:'fulfillment_'+step+'_check_required'}).eq('id',order.id).select('*').single());
 }
}
function publicOrder(o:any){return {id:o.id,status:o.status,is_test:true,created_at:o.created_at,paid_at:o.paid_at,total_cents:o.totals.total_cents,shipping_cents:o.totals.shipping_cents,country:o.country,items:o.items.map((x:any)=>({key:x.key,label:x.label,model:x.model,quantity:x.quantity,photoId:x.photoId,sizing:x.sizing})),shipments:o.provider_status?.shipments||[],provider_stage:o.provider_status?.stage,error_code:o.error_code};}

Deno.serve(async(req)=>{
 const pre=handleOptions(req);if(pre)return pre;
 try{
  const url=new URL(req.url);const action=url.pathname.split('/').pop()||'';
  if(action==='webhook'){
   must(req.method==='POST','Methode nicht erlaubt.',405);
   const secret=Deno.env.get('PHOTO_PRODUCTS_STRIPE_WEBHOOK_SECRET');must(secret,'Webhook noch nicht eingerichtet.',503);
   const event=await stripe.webhooks.constructEventAsync(await req.text(),req.headers.get('stripe-signature')||'',secret);
   must(!event.livemode,'Live-Ereignisse sind gesperrt.',403);
   if(['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)){
    const id=(event.data.object as any).metadata?.photo_product_order;
    if(id&&UUID.test(id)){const o=checked(await db.from('photo_product_orders').select('*').eq('id',id).eq('park_id',PLOSE_ID).maybeSingle());if(o)await fulfill(await refreshPayment(o));}
   }
   return json({received:true});
  }
  if(action==='callback'){
   must(req.method==='POST','Methode nicht erlaubt.',405);const b=await req.json();const id=b.data?.order?.id||b.data?.id||b.order?.id||b.orderId||b.subject;
   if(typeof id==='string'&&/^ord_[a-z0-9_-]+$/i.test(id)){const o=checked(await db.from('photo_product_orders').select('*').eq('provider_order_id',id).eq('park_id',PLOSE_ID).maybeSingle());if(o)await syncProvider(o);}
   return json({received:true});
  }
  if(action==='preview'){must(req.method==='GET','Methode nicht erlaubt.',405);await shop();return await preview(req,url.searchParams.get('id')||'');}
  const body=req.method==='GET'?Object.fromEntries(url.searchParams):await req.json();
  if(action==='config'){
   const s=await shop();const settings=checked(await db.from('park_shop_settings').select('shop_name,logo_url,accent_color').eq('park_id',PLOSE_ID).single());
   return json({park_id:PLOSE_ID,name:settings.shop_name||'Plosebob Foto-Shop',logo:settings.logo_url||'/shop-brands/plose-logo.png',accent:settings.accent_color||'#0B2545',products:products(s).map(publicProduct),countries:COUNTRIES,mode:'sandbox',stripe_ready:testKey,fulfillment_ready:!!Deno.env.get('PRODIGI_SANDBOX_API_KEY')});
  }
  if(action==='photos'){
   await shop();
   let q=db.from('photos').select('id,captured_at,source_file_code').eq('park_id',PLOSE_ID).eq('is_test',false);
   const publicPhoto=(p:any)=>({id:p.id,number:photoNumber(p),capturedAt:p.captured_at,thumb:base+'/preview?id='+p.id});
   if(body.code!==undefined){
    must(req.method==='POST'&&typeof body.code==='string'&&/^\d{16}$/.test(body.code),'Ungültiger Bildcode.');
    const rows=checked(await q.eq('external_code',body.code).limit(2));
    return json({photos:rows.length===1?rows.map(publicPhoto):[],next:null});
   }
   const date=typeof body.date==='string'?body.date:'';must(!date||/^\d{4}-\d{2}-\d{2}$/.test(date),'Ungültiges Datum.');
   if(date){const start=new Date(date+'T00:00:00Z');must(!isNaN(+start)&&start.toISOString().slice(0,10)===date,'Ungültiges Datum.');
    // Resolve Europe/Rome midnight independently at both boundaries (DST).
    const next=new Date(+start+86400000).toISOString().slice(0,10);let from=parkTime(date),to=parkTime(next);
    if(body.time){must(typeof body.time==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(body.time),'Ungültige Uhrzeit.');const center=parkTime(date,body.time);from=Math.max(from,center-15*60000);to=Math.min(to,center+15*60000);}
    q=q.gte('captured_at',new Date(from).toISOString()).lt('captured_at',new Date(to).toISOString());
   }
   must(!body.time||!!date,'Bitte zur Uhrzeit ein Datum wählen.');
   if(body.number){must(/^\d{1,8}$/.test(String(body.number)),'Ungültige Bildnummer.');q=q.eq('source_file_code',String(body.number).padStart(4,'0'));}
   if(body.before){must(UUID.test(String(body.before)),'Ungültige Seite.');const cursor=await photo(body.before);q=q.or(`captured_at.lt.${cursor.captured_at},and(captured_at.eq.${cursor.captured_at},id.lt.${cursor.id})`);}
   const rows=checked(await q.order('captured_at',{ascending:false}).order('id',{ascending:false}).limit(25));
   return json({photos:rows.slice(0,24).map(publicPhoto),next:rows.length>24?rows[23].id:null});
  }
  must(req.method==='POST','Methode nicht erlaubt.',405);
  if(action==='quote')return json(await makeQuote(req,body));
  if(action==='checkout'){await rate(req,'checkout',15);return json(await checkout(body));}
  if(action==='order'){await rate(req,'order',100);let o=await verifiedOrder(body);o=await fulfill(await refreshPayment(o));return json(publicOrder(o));}
  if(action==='download'){let o=await verifiedOrder(body);o=await refreshPayment(o);must(o.paid_at,'Foto noch nicht bezahlt.',403);const index=Number(body.index);must(Number.isInteger(index)&&o.items[index]?.key==='digital','Download nicht enthalten.',403);return json({url:await original(o,index)});}
  if(action==='operator'){
   const staff=await requireAdminFromRequest(req);
   must(staff.ok||(await requireOperatorForPark(req,PLOSE_ID,['shop'])).ok,'Kein Zugriff auf Plose.',403);const s=await shop();
   if(body.prices){const prices:any={};for(const [k,v] of Object.entries(body.prices)){must(PHOTO_PRODUCTS.some(p=>p.key===k)&&Number.isInteger(v)&&Number(v)>=50&&Number(v)<=100000,'Ungültiger Produktpreis.');prices[k]=v;}checked(await db.from('park_photo_product_shops').update({prices:{...s.prices,...prices},updated_at:new Date().toISOString()}).eq('park_id',PLOSE_ID));}
   const orders=checked(await db.from('photo_product_orders').select('*').eq('park_id',PLOSE_ID).order('created_at',{ascending:false}).limit(100));
   const internal=staff.ok||await canViewInternalCosts(req);
   return json({products:products(await shop()).map(publicProduct),orders:orders.map((o:any)=>({...publicOrder(o),provider_order_id:o.provider_order_id,recipient:o.recipient,...(internal?{totals:o.totals,margin:calculateMargin(o.totals.total_cents,o.totals.supplier_total_cents,o.totals.supplier_tax_cents,o.totals.vat_rate)}:{})})),can_view_costs:internal,...(internal?{costs:productCostSnapshot}:{}),mode:'sandbox',stripe_ready:testKey,fulfillment_ready:!!Deno.env.get('PRODIGI_SANDBOX_API_KEY')});
  }
  if(action==='setup-webhook'){
   const auth=await requireAdminFromRequest(req);must(auth.ok,'Nur Liftpictures-Admin.',403);must(testKey,'Stripe-Testzugang fehlt.',503);
   const endpoints=await stripe.webhookEndpoints.list({limit:100});must(!endpoints.data.some((e:any)=>e.url===base+'/webhook'),'Webhook existiert bereits.',409);
   const endpoint=await stripe.webhookEndpoints.create({url:base+'/webhook',enabled_events:['checkout.session.completed','checkout.session.async_payment_succeeded'],description:'Plose photo products · TEST only'});
   return json({id:endpoint.id,secret:endpoint.secret});
  }
  return json({error:'Unbekannte Anfrage.'},404);
 }catch(e){const err=e as any;console.error('photo-product-shop',err.status||500,err.message?.startsWith('Daten')?'database_error':err.status?'request_rejected':'internal_error');return json({error:err.status?err.message:'Die Anfrage konnte nicht verarbeitet werden. Bitte erneut versuchen.'},err.status||500);}
});
