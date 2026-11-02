import { normalizeCart, calculateMargin } from './photoProductCatalog.ts';
const photo='d83d5781-9fb5-41e8-9cd6-9dd32b9a86c4';
function assert(value:unknown){if(!value)throw new Error('Assertion failed');}
function rejects(fn:()=>unknown){let rejected=false;try{fn();}catch{rejected=true;}assert(rejected);}
Deno.test('Invalid models and fractional, zero or excessive quantities never reach fulfilment',()=>{
 for(const quantity of [0,-1,1.5,6])rejects(()=>normalizeCart([{key:'mug',photoId:photo,quantity,sizing:'fitPrintArea'}]));
 rejects(()=>normalizeCart([{key:'phonecase',photoId:photo,quantity:1,model:'Unknown phone',sizing:'fitPrintArea'}]));
 rejects(()=>normalizeCart([{key:'arbitrary-sku',photoId:photo,quantity:1,sizing:'fitPrintArea'}]));
 rejects(()=>normalizeCart([{key:'mug',photoId:photo,quantity:1,sizing:'unexpected'}]));
});
Deno.test('Client-supplied prices and supplier SKUs are discarded',()=>{
 const [item]=normalizeCart([{key:'mug',photoId:photo,quantity:1,sizing:'fitPrintArea',price_cents:1,sku:'ATTACK'}]);
 assert(!('price_cents' in item)&&!('sku' in item));
});
Deno.test('Italy phone-case example includes VAT, supplier tax, shipping, payment fee and reserve',()=>{
 const m=calculateMargin(4440,2582,431,.22);
 assert(m.sales_tax_cents===801&&m.payment_fee_cents===92&&m.reserve_cents===133&&m.contribution_cents===832);
 const recovered=calculateMargin(4440,2582,431,.22,true);
 assert(recovered.contribution_cents===1263);
});
Deno.test('Loss-making baskets remain losses instead of being clamped to zero',()=>{
 assert(calculateMargin(1000,1500,0,.22).contribution_cents<0);
});
