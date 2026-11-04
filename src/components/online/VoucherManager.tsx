// Codes für Online-Foto-Parks (Kalahari): z. B. mit der Eintrittskarte verkaufen („Foto-Paket an der Kasse“),
// als Gutschein verschenken oder als Tagespass. Gast gibt den Code auf der Fotoseite ein und bekommt das Original.
// Erzeugen und Löschen nur Parkinhaber; Liste, CSV und Druckbogen alle Betreiber des Parks.
import { useCallback, useEffect, useState } from 'react';
import { Download, Printer, Ticket, Trash2 } from 'lucide-react';
import { useI18n, useLocaleTag } from '../../lib/i18n';
import { voucherCall, type VoucherBatch } from '../../lib/onlinePark';

const SITE = 'https://liftpictures-fotos.de';
const fmt = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;

export default function VoucherManager({ parkId, codesOn, shopPath, photoPrice, onEnable }: {
  parkId: string; codesOn: boolean; shopPath: string; photoPrice: string; onEnable: () => void;
}) {
  const { t } = useI18n();
  const locale = useLocaleTag();
  const [batches, setBatches] = useState<VoucherBatch[] | null>(null);
  const [form, setForm] = useState({ label: '', kind: 'photos' as 'photos' | 'day', photos: 1, count: 100, valid_from: '', valid_until: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    voucherCall<{ batches: VoucherBatch[] }>(parkId, { action: 'list' }).then((d) => setBatches(d.batches)).catch(() => setBatches([]));
  }, [parkId]);
  useEffect(() => { load(); }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const r = await voucherCall<{ created: number }>(parkId, {
        action: 'create', label: form.label.trim(), kind: form.kind, photos: form.kind === 'photos' ? form.photos : undefined, count: form.count,
        valid_from: form.valid_from || undefined, valid_until: form.valid_until || undefined,
      });
      setMsg({ ok: true, text: t('codes.created', { n: r.created }) });
      setForm((f) => ({ ...f, label: '' }));
      load();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error && !/^HTTP/.test(err.message) ? (err.message === 'Park owner required' ? t('codes.owner_only') : err.message) : t('codes.failed') });
    } finally {
      setBusy(false);
    }
  }

  async function codesOf(b: VoucherBatch) {
    return (await voucherCall<{ codes: { code: string; uses: number; first_used_on: string | null }[] }>(parkId, { action: 'export', batch_id: b.id })).codes;
  }

  async function csv(b: VoucherBatch) {
    const rows = await codesOf(b);
    const lines = ['code,link,photos_used,first_used_on', ...rows.map((r) => `${fmt(r.code)},${SITE}/${shopPath}/shop?voucher=${r.code},${r.uses},${r.first_used_on ?? ''}`)];
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = `photo-codes-${b.label.replace(/[^\w-]+/g, '-')}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  /** Druckbogen: Karten mit Code und QR-Code (öffnet den Fotoshop mit eingetragenem Code). */
  async function print(b: VoucherBatch) {
    const rows = await codesOf(b);
    const what = b.kind === 'day' ? 'All your photos of the day' : b.photos === 1 ? '1 digital photo' : `${b.photos} digital photos`;
    const cards = rows.map((r) => {
      const link = `${SITE}/${shopPath}/shop?voucher=${r.code}`;
      return `<div class="c"><img src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=4&data=${encodeURIComponent(link)}" alt=""><div><p class="t">Your adventure photo</p><p class="w">${what}</p><p class="k">${fmt(r.code)}</p><p class="h">Scan the code or go to liftpictures-fotos.de/${shopPath}/shop and enter it at your photo.</p></div></div>`;
    }).join('');
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${b.label}</title><style>
      body{font-family:Arial,sans-serif;margin:0;padding:10mm}.g{display:grid;grid-template-columns:1fr 1fr;gap:6mm}
      .c{display:flex;gap:4mm;align-items:center;border:1px dashed #999;padding:4mm;break-inside:avoid}
      .c img{width:28mm;height:28mm}.t{margin:0;font-weight:700;color:#002858}.w{margin:1mm 0;font-size:11px;color:#555}
      .k{margin:1mm 0;font:700 20px monospace;letter-spacing:2px}.h{margin:0;font-size:9px;color:#666}
      @media print{body{padding:6mm}}</style></head><body><div class="g">${cards}</div>
      <script>window.onload=()=>setTimeout(()=>window.print(),600)</script></body></html>`);
    w.document.close();
  }

  async function remove(b: VoucherBatch) {
    if (!window.confirm(t('codes.delete_confirm', { label: b.label }))) return;
    try { await voucherCall(parkId, { action: 'delete', batch_id: b.id }); load(); }
    catch { setMsg({ ok: false, text: t('codes.owner_only') }); }
  }

  const describe = (b: VoucherBatch) =>
    `${b.kind === 'day' ? t('codes.kind_day') : t('codes.kind_photos', { n: b.photos ?? 1 })}${b.valid_from || b.valid_until
      ? ` · ${b.valid_from ? new Date(`${b.valid_from}T12:00:00`).toLocaleDateString(locale) : '…'} – ${b.valid_until ? new Date(`${b.valid_until}T12:00:00`).toLocaleDateString(locale) : '…'}` : ''}`;

  return (
    <section className="rounded-xl border border-[color:var(--line)] bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[color:var(--line)] px-5 py-4">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-base font-semibold text-[color:var(--ink)]"><Ticket className="h-4 w-4 text-[color:var(--ink-3)]" />{t('codes.title')}</h3>
          <p className="mt-0.5 max-w-3xl text-sm text-[color:var(--ink-3)]">{t('codes.sub', { price: photoPrice })}</p>
        </div>
        {!codesOn && (
          <button type="button" className="glass-button-secondary" onClick={onEnable}>{t('codes.enable')}</button>
        )}
      </div>
      {!codesOn && <p className="mx-5 mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{t('codes.off_note')}</p>}

      <div className="grid gap-0 lg:grid-cols-[360px_minmax(0,1fr)] lg:divide-x lg:divide-[color:var(--line)]">
        <form className="space-y-3 p-5" onSubmit={create}>
          <p className="text-sm font-semibold text-[color:var(--ink)]">{t('codes.new')}</p>
          <label className="grid gap-1 text-sm"><span className="text-xs font-medium text-[color:var(--ink-2)]">{t('codes.label')}</span>
            <input className="glass-input" required maxLength={80} value={form.label} placeholder={t('codes.label_ph')} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          </label>
          <div className="grid gap-1 text-sm">
            <span className="text-xs font-medium text-[color:var(--ink-2)]">{t('codes.kind')}</span>
            <div className="inline-flex w-fit rounded-md border border-[color:var(--line-strong)] p-0.5">
              {([['photos', t('codes.kind_photos_short')], ['day', t('codes.kind_day')]] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setForm({ ...form, kind: k })}
                  className={`rounded px-3 py-1.5 text-xs font-medium ${form.kind === k ? 'bg-[color:var(--ink)] text-white' : 'text-[color:var(--ink-2)] hover:bg-slate-100'}`}>{l}</button>
              ))}
            </div>
            <span className="text-xs text-[color:var(--ink-3)]">{form.kind === 'day' ? t('codes.kind_day_hint') : t('codes.kind_photos_hint')}</span>
          </div>
          <div className="flex gap-3">
            {form.kind === 'photos' && (
              <label className="grid gap-1 text-sm"><span className="text-xs font-medium text-[color:var(--ink-2)]">{t('codes.photos_per_code')}</span>
                <input className="glass-input w-24" type="number" min={1} max={50} value={form.photos} onChange={(e) => setForm({ ...form, photos: Number(e.target.value) })} />
              </label>
            )}
            <label className="grid gap-1 text-sm"><span className="text-xs font-medium text-[color:var(--ink-2)]">{t('codes.count')}</span>
              <input className="glass-input w-24" type="number" min={1} max={2000} value={form.count} onChange={(e) => setForm({ ...form, count: Number(e.target.value) })} />
            </label>
          </div>
          <div className="flex gap-3">
            <label className="grid gap-1 text-sm"><span className="text-xs font-medium text-[color:var(--ink-2)]">{t('codes.valid_from')}</span>
              <input className="glass-input" type="date" value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} />
            </label>
            <label className="grid gap-1 text-sm"><span className="text-xs font-medium text-[color:var(--ink-2)]">{t('codes.valid_until')}</span>
              <input className="glass-input" type="date" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} />
            </label>
          </div>
          <button className="glass-button-primary" disabled={busy || !form.label.trim()}>{busy ? t('app.loading') : t('codes.create')}</button>
          {msg && <p role="status" className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'}`}>{msg.text}</p>}
        </form>

        <div className="p-5">
          <p className="text-sm font-semibold text-[color:var(--ink)]">{t('codes.list')}</p>
          {batches === null ? <div className="mt-3 h-24 animate-pulse rounded-lg bg-slate-100" />
            : !batches.length ? <p className="mt-3 text-sm text-[color:var(--ink-3)]">{t('codes.none')}</p>
            : (
              <ul className="mt-3 divide-y divide-[color:var(--line)] rounded-lg border border-[color:var(--line)]">
                {batches.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[color:var(--ink)]">{b.label}</p>
                      <p className="text-xs text-[color:var(--ink-3)]">{describe(b)}</p>
                    </div>
                    <div className="text-right text-xs text-[color:var(--ink-2)]">
                      <p><b>{b.used}</b> / {b.total} {t('codes.used')}</p>
                      <p className="text-[color:var(--ink-3)]">{t('codes.photos_unlocked', { n: b.redeemed_photos })}</p>
                    </div>
                    <div className="flex gap-1">
                      <button type="button" className="rounded-md p-2 text-[color:var(--ink-3)] hover:bg-slate-100 hover:text-[color:var(--ink)]" title={t('codes.print')} aria-label={t('codes.print')} onClick={() => void print(b)}><Printer className="h-4 w-4" /></button>
                      <button type="button" className="rounded-md p-2 text-[color:var(--ink-3)] hover:bg-slate-100 hover:text-[color:var(--ink)]" title="CSV" aria-label="CSV" onClick={() => void csv(b)}><Download className="h-4 w-4" /></button>
                      <button type="button" className="rounded-md p-2 text-[color:var(--ink-3)] hover:bg-rose-50 hover:text-rose-700" title={t('codes.delete')} aria-label={t('codes.delete')} onClick={() => void remove(b)}><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          <p className="mt-3 text-xs text-[color:var(--ink-3)]">{t('codes.how')}</p>
        </div>
      </div>
    </section>
  );
}
