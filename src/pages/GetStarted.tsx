import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, ChevronDown, Clock, LifeBuoy, BookOpen, PlayCircle, RotateCcw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../lib/i18n';
import { useOnboarding, type VisibleGuideItem } from '../lib/onboarding';
import GlassCard from '../components/ui/GlassCard';
import ProgressRing from '../components/onboarding/ProgressRing';

// Seite „Erste Schritte“ (HubSpot-Stil „Setup guide“): jede Seite des Dashboards mit dem, was man dort tun kann,
// in Abschnitten, zum Abhaken. Ein Seitenbesuch hakt automatisch ab; von Hand geht es auch.
export default function GetStarted() {
  const { t } = useI18n();
  const { profile } = useAuth();
  const { sections, next, doneCount, total, percent, complete, hidden, toggle, setHidden, reset } = useOnboarding();
  const firstName = (profile?.full_name ?? '').trim().split(/\s+/)[0] ?? '';

  // Offen ist der Abschnitt mit dem nächsten Schritt; aufgeklappt genau dieser Schritt.
  const nextSectionId = sections.find((s) => s.items.some((i) => !i.done))?.id ?? sections[0]?.id ?? null;
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [openItem, setOpenItem] = useState<string | null>(null);
  useEffect(() => {
    if (openItem === null && next) setOpenItem(next.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next?.id]);
  const isOpen = (id: string) => openSections[id] ?? id === nextSectionId;

  const startTour = () => window.dispatchEvent(new Event('lp:start-tour'));

  function row(item: VisibleGuideItem) {
    const Icon = item.icon;
    const expanded = openItem === item.id;
    return (
      <li key={item.id} className="border-t border-[color:var(--line)] first:border-0">
        <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
          <button
            type="button"
            role="checkbox"
            aria-checked={item.done}
            aria-label={`${item.done ? t('ob.mark_undone') : t('ob.mark_done')}: ${t(`ob.${item.id}.title`)}`}
            title={item.done ? t('ob.mark_undone') : t('ob.mark_done')}
            onClick={() => toggle(item.id)}
            className="-m-2.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
          >
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors ${
                item.done ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white text-transparent hover:border-brand-600'
              }`}
            >
              <Check className="h-3.5 w-3.5" strokeWidth={3} />
            </span>
          </button>
          <button
            type="button"
            onClick={() => setOpenItem(expanded ? '' : item.id)}
            aria-expanded={expanded}
            className="flex min-h-[44px] min-w-0 flex-1 items-center gap-3 text-left"
          >
            <span className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[color:var(--ink-2)] sm:flex">
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className={`block text-sm font-semibold sm:truncate ${item.done ? 'text-[color:var(--ink-3)] line-through decoration-slate-300' : 'text-[color:var(--ink)]'}`}>
                {t(`ob.${item.id}.title`)}
              </span>
              <span className="hidden truncate text-xs text-[color:var(--ink-3)] sm:block">{t(`ob.${item.id}.purpose`)}</span>
            </span>
            {item.locked && (
              <span className="hidden shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700 ring-1 ring-inset ring-brand-200 sm:inline">
                {t('ob.locked')}
              </span>
            )}
            <span className="hidden shrink-0 items-center gap-1 text-xs text-[color:var(--ink-3)] sm:inline-flex">
              <Clock className="h-3.5 w-3.5" /> {t('ob.min', { minutes: item.minutes })}
            </span>
            <ChevronDown className={`h-4 w-4 shrink-0 text-[color:var(--ink-3)] transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {expanded && (
          <div className="px-4 pb-5 sm:pl-[68px] sm:pr-5">
            <p className="text-sm leading-relaxed text-[color:var(--ink-2)]">{t(`ob.${item.id}.purpose`)}</p>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[color:var(--ink-3)] sm:hidden">
              <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {t('ob.min', { minutes: item.minutes })}</span>
              {item.locked && (
                <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700 ring-1 ring-inset ring-brand-200">{t('ob.locked')}</span>
              )}
            </p>
            <p className="mt-3 text-xs font-semibold text-[color:var(--ink-3)]">{t('ob.can_title')}</p>
            <ul className="mt-1.5 space-y-1.5">
              {[1, 2, 3].map((n) => (
                <li key={n} className="flex gap-2 text-sm leading-snug text-[color:var(--ink-2)]">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                  {t(`ob.${item.id}.can${n}`)}
                </li>
              ))}
            </ul>
            {item.locked && <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-[color:var(--ink-3)]">{t('ob.locked_hint')}</p>}
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center [&>*]:justify-center">
              {item.action === 'tour' ? (
                <button type="button" onClick={startTour} className="glass-button-primary">
                  <PlayCircle className="h-4 w-4" /> {t('ob.start_tour')}
                </button>
              ) : (
                <Link to={item.path} className="glass-button-primary">
                  {t('ob.open_page')} <ArrowRight className="h-4 w-4" />
                </Link>
              )}
              <button type="button" onClick={() => toggle(item.id)} className="glass-button-secondary">
                {item.done ? t('ob.mark_undone') : t('ob.mark_done')}
              </button>
            </div>
          </div>
        )}
      </li>
    );
  }

  return (
    <div className="space-y-6">
      {/* Kopf mit Fortschritt: auf dem Handy untereinander (Ring + Titel, Text, Balken, Knöpfe), ab lg nebeneinander. */}
      <div className="rounded-xl border border-[color:var(--line)] bg-white p-5 sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-4">
              <ProgressRing percent={percent} size={64} stroke={6}>
                <span className="text-sm font-semibold text-[color:var(--ink)]">{percent}%</span>
              </ProgressRing>
              <h1 className="min-w-0 flex-1 text-[24px] font-light leading-tight tracking-tight text-[color:var(--ink)] sm:text-[32px]">
                {complete ? t('ob.all_done_title') : firstName ? t('ob.welcome', { name: firstName }) : t('ob.welcome_plain')}
              </h1>
            </div>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[color:var(--ink-3)]">{complete ? t('ob.all_done_text') : t('ob.hero_text')}</p>
            <div className="mt-3 flex items-center gap-3">
              <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100 sm:max-w-xs">
                <div className="h-full rounded-full bg-brand-600 transition-[width] duration-500" style={{ width: `${percent}%` }} />
              </div>
              <span className="shrink-0 text-xs font-medium text-[color:var(--ink-2)]">{t('ob.progress', { done: doneCount, total })}</span>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row lg:shrink-0 [&>*]:justify-center">
            <button type="button" onClick={startTour} className="glass-button-secondary">
              <PlayCircle className="h-4 w-4" /> {t('ob.start_tour')}
            </button>
            {next && !next.action && (
              <Link to={next.path} className="glass-button-primary">
                {t('ob.continue')} <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* Abschnitte */}
        <div className="space-y-4">
          {sections.map((section, index) => {
            const done = section.items.filter((i) => i.done).length;
            const open = isOpen(section.id);
            const finished = done === section.items.length;
            return (
              <GlassCard key={section.id} className="overflow-hidden p-0">
                <button
                  type="button"
                  onClick={() => setOpenSections((s) => ({ ...s, [section.id]: !open }))}
                  aria-expanded={open}
                  className="flex w-full items-center gap-4 px-4 py-4 text-left sm:px-5"
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                      finished ? 'bg-brand-600 text-white' : 'bg-[color:var(--ink)] text-white'
                    }`}
                  >
                    {finished ? <Check className="h-4 w-4" strokeWidth={3} /> : index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-semibold text-[color:var(--ink)]">{t(section.titleKey)}</span>
                    <span className="block text-xs text-[color:var(--ink-3)]">{t(section.subKey)}</span>
                  </span>
                  <span className="shrink-0 text-xs font-medium text-[color:var(--ink-2)]">{done}/{section.items.length}</span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-[color:var(--ink-3)] transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>
                {open && <ul className="border-t border-[color:var(--line)]">{section.items.map(row)}</ul>}
              </GlassCard>
            );
          })}
        </div>

        {/* Rechte Spalte */}
        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          {next && (
            <GlassCard className="p-5">
              <p className="text-xs font-semibold text-[color:var(--ink-3)]">{t('ob.next_up')}</p>
              <p className="mt-1.5 text-base font-semibold text-[color:var(--ink)]">{t(`ob.${next.id}.title`)}</p>
              <p className="mt-1 text-sm leading-relaxed text-[color:var(--ink-2)]">{t(`ob.${next.id}.purpose`)}</p>
              {next.action === 'tour' ? (
                <button type="button" onClick={startTour} className="glass-button-primary mt-4 w-full justify-center">
                  <PlayCircle className="h-4 w-4" /> {t('ob.start_tour')}
                </button>
              ) : (
                <Link to={next.path} className="glass-button-primary mt-4 w-full justify-center">
                  {t('ob.open_page')} <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </GlassCard>
          )}

          <GlassCard className="p-5">
            <p className="text-base font-semibold text-[color:var(--ink)]">{t('ob.help_title')}</p>
            <p className="mt-1 text-sm leading-relaxed text-[color:var(--ink-2)]">{t('ob.help_text')}</p>
            <div className="mt-4 flex flex-col gap-2">
              <Link to="/tickets" className="glass-button-secondary justify-center">
                <LifeBuoy className="h-4 w-4" /> {t('ob.help_support')}
              </Link>
              <Link to="/ratgeber" className="glass-button-secondary justify-center">
                <BookOpen className="h-4 w-4" /> {t('ob.help_guide')}
              </Link>
            </div>
          </GlassCard>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-[color:var(--ink-3)]">
            {hidden ? (
              <button type="button" onClick={() => setHidden(false)} className="font-medium text-brand-700 hover:underline">{t('ob.restore')}</button>
            ) : (
              !complete && <button type="button" onClick={() => setHidden(true)} className="hover:underline">{t('ob.dismiss')}</button>
            )}
            {doneCount > 0 && (
              <button type="button" onClick={reset} className="inline-flex items-center gap-1 hover:underline">
                <RotateCcw className="h-3 w-3" /> {t('ob.reset')}
              </button>
            )}
          </div>
          {hidden && <p className="px-1 text-xs leading-relaxed text-[color:var(--ink-3)]">{t('ob.dismissed_note')}</p>}
        </aside>
      </div>
    </div>
  );
}
