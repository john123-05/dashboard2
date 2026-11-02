// Retail proposals include destination VAT. Supplier prices always come from
// authenticated Prodigi quotes; these are not production-cost estimates.
export const PLOSE_ID = '3b08e092-beb5-46ec-9811-5698e86dd83a';
export const COUNTRIES = { IT: { label: 'Italia', vat: .22 }, DE: { label: 'Deutschland', vat: .19 }, AT: { label: 'Österreich', vat: .20 } };
export const PHONE_MODELS = [
  ['iPhone 14','GLOBAL-TECH-IP14-TCB-CS-G'], ['iPhone 15','GLOBAL-TECH-IP15-TCB-CS-G'],
  ['iPhone 15 Pro','GLOBAL-TECH-IP15PR-TCB-CS-G'], ['iPhone 16','GLOBAL-TECH-IP16-TCB-CS-G'],
  ['iPhone 16 Pro','GLOBAL-TECH-IP16PR-TCB-CS-G'], ['iPhone 17','GLOBAL-TECH-IP17-TCB-CS-G'],
  ['iPhone 17 Pro','GLOBAL-TECH-IP17PR-TCB-CS-G'], ['Galaxy S24','GLOBAL-TECH-SGS24-TCB-CS-G'],
  ['Galaxy S24 Ultra','GLOBAL-TECH-SGS24U-TCB-CS-G'], ['Galaxy S25','GLOBAL-TECH-SGS25-TCB-CS-G'],
  ['Galaxy S25 Ultra','GLOBAL-TECH-SGS25U-TCB-CS-G'], ['Pixel 9','GLOBAL-TECH-GP9-TCB-CS-G'],
];
export const PHOTO_PRODUCTS = [
  { key:'digital', label:'Digitales Foto', description:'Originaldatei nach dem Kauf herunterladen.', price_cents:499, sku:null, attributes:{}, ratio:4/3, kind:'digital' },
  { key:'print', label:'Fotoabzug 13 × 18 cm', description:'Lustre-Fotopapier mit satinierter Oberfläche; ca. 5 × 7 Zoll.', price_cents:990, sku:'GLOBAL-PAP-5X7', attributes:{}, ratio:5/7, kind:'print' },
  { key:'mug', label:'Fototasse 325 ml', description:'Weiße Keramiktasse mit deinem Foto, glänzend. 11 oz.', price_cents:1990, sku:'GLOBAL-MUG-W', attributes:{}, ratio:2670/1110, kind:'mug' },
  { key:'poster', label:'Poster 30 × 40 cm', description:'Mattes Kunstdruckpapier, 200 g/m²; ca. 12 × 16 Zoll.', price_cents:2490, sku:'GLOBAL-FAP-12X16', attributes:{}, ratio:3/4, kind:'poster' },
  { key:'frame', label:'Gerahmtes Foto 20 × 25 cm', description:'Schwarzer Classic-Rahmen, Acrylglas, ohne Passepartout; ca. 8 × 10 Zoll.', price_cents:5990, sku:'GLOBAL-CFP-8X10', attributes:{color:'black'}, ratio:4/5, kind:'frame' },
  { key:'phonecase', label:'Handyhülle mit Foto', description:'Tough Case, zweilagig, glänzend. Bitte das genaue Handymodell wählen.', price_cents:3490, sku:null, attributes:{}, ratio:.49, kind:'phonecase', models:PHONE_MODELS.map(([label,sku])=>({label,sku})) },
];
export type ProductItem = { key:string; photoId:string; quantity:number; model?:string; sizing:'fitPrintArea'|'fillPrintArea' };
export function normalizeCart(raw:unknown): ProductItem[] {
  if(!Array.isArray(raw)||!raw.length||raw.length>10) throw new Error('Bitte 1 bis 10 Positionen wählen.');
  return raw.map(x=>{
    if(!x||!PHOTO_PRODUCTS.some(p=>p.key===x.key)||typeof x.photoId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(x.photoId)||!Number.isInteger(x.quantity)||x.quantity<1||x.quantity>5) throw new Error('Ungültige Position.');
    if(x.key==='phonecase'&&!PHONE_MODELS.some(([label])=>label===x.model)) throw new Error('Bitte ein verfügbares Handymodell wählen.');
    if(x.sizing!=='fitPrintArea'&&x.sizing!=='fillPrintArea')throw new Error('Bitte den Bildausschnitt bestätigen.');
    if(x.key==='digital'&&x.quantity!==1)throw new Error('Digitale Fotos sind nur einmal je Position nötig.');
    return {key:x.key,photoId:x.photoId,quantity:x.quantity,model:x.key==='phonecase'?x.model:undefined,sizing:x.sizing};
  });
}
export function cents(value:unknown):number { const n=Number(value);if(!Number.isFinite(n)||n<0)throw new Error('Ungültiges Preisangebot.');return Math.round(n*100); }
export function calculateMargin(gross:number,supplierGross:number,supplierTax:number,vat:number,recoverVat=false,feeRate=.015,feeFixed=25,reserveRate=.03){
  const salesTax=Math.round(gross-gross/(1+vat)), fee=Math.round(gross*feeRate)+feeFixed;
  const costs=supplierGross-(recoverVat?supplierTax:0), reserve=Math.round(gross*reserveRate);
  return {gross_cents:gross,sales_tax_cents:salesTax,net_sales_cents:gross-salesTax,supplier_cost_cents:costs,payment_fee_cents:fee,reserve_cents:reserve,contribution_cents:gross-salesTax-costs-fee-reserve};
}
