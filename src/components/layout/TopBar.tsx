import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  Bell,
  DollarSign,
  LayoutDashboard,
  Menu,
  BookOpen,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  Coins,
  CreditCard,
  ExternalLink,
  FileQuestion,
  LifeBuoy,
  Mail,
  MailOpen,
  Maximize2,
  Minimize2,
  Phone,
  Play,
  Printer,
  RotateCcw,
  Search,
  Settings,
  Trash2,
  Ban,
  UserCog,
  WifiOff,
  X,
  AlertTriangle,
  Package,
  MessageSquare,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { usePark } from '../../contexts/ParkContext';
import { useI18n, useLocaleTag } from '../../lib/i18n';
import { formatRelative } from '../../lib/utils';
import { type FeedItem, type NotificationFeed } from '../../lib/notificationFeed';
import { useNotifications } from '../../contexts/NotificationsContext';
import { PLAN_LABEL_KEY, useEntitlements } from '../../lib/plans';
import {
  HELP_ARTICLES,
  SUPPORT_EMAIL,
  SUPPORT_PHONE,
  SUPPORT_PHONE_HREF,
  articlesForPath,
  pageLabelKey,
} from '../../lib/helpContent';

// Leiste oben rechts (nur Desktop, ab 901 px): Hilfe, Einstellungen,
// Benachrichtigungen, Profil - nach dem Vorbild der HubSpot-Kopfleiste, aber
// nur als kleine Ecke statt über die ganze Breite.
//  - Benachrichtigungen: Schublade, die von rechts hereingleitet
//  - Hilfe-Center: schwebendes Fenster, verschiebbar, minimierbar
//  - Profil: kleines Menü unter dem Namen

type Panel = 'notifications' | 'help' | 'profile' | null;

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || '?'
  );
}

function startTour() {
  window.dispatchEvent(new Event('lp:start-tour'));
}

export default function TopBar({ onOpenNav }: { onOpenNav?: () => void }) {
  const { t } = useI18n();
  const { profile, isOwner, isStaff } = useAuth();
  const location = useLocation();
  const [panel, setPanel] = useState<Panel>(null);
  const feed = useNotifications();
  const { parkName } = usePark();

  // Seitenwechsel schliesst Menü und Schublade (das Hilfe-Center darf offen bleiben).
  useEffect(() => {
    setPanel((p) => (p === 'help' ? p : null));
  }, [location.pathname]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPanel(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggle = (next: Exclude<Panel, null>) => setPanel((p) => (p === next ? null : next));
  const name = profile?.full_name || profile?.email || '';
  const unread = feed.unread.length;

  return (
    <>
      <div className="operator-topbar fixed right-0 top-0 z-[70] hidden items-center gap-0.5 rounded-bl-xl bg-[var(--sidebar-bg)] py-1 pl-2 pr-2 shadow-[0_2px_10px_rgba(0,0,0,0.12)] min-[901px]:flex">
        <BarButton label={t('top.help')} active={panel === 'help'} onClick={() => toggle('help')}>
          <HelpCircle className="h-[18px] w-[18px]" />
        </BarButton>
        {isOwner && !isStaff && (
          <BarButton label={t('nav.settings')} href="/settings">
            <Settings className="h-[18px] w-[18px]" />
          </BarButton>
        )}
        <BarButton label={t('top.notifications')} active={panel === 'notifications'} onClick={() => toggle('notifications')}>
          <Bell className="h-[18px] w-[18px]" />
          {unread > 0 && (
            <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-[var(--sidebar-bg)]">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </BarButton>
        <span className="mx-1.5 h-5 w-px bg-white/15" aria-hidden />
        <button
          type="button"
          onClick={() => toggle('profile')}
          aria-expanded={panel === 'profile'}
          className={`flex items-center gap-2 rounded-full py-1 pl-1 pr-2 text-sm text-white/85 transition hover:bg-white/10 ${panel === 'profile' ? 'bg-white/10' : ''}`}
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-[11px] font-semibold text-white">{initials(name)}</span>
          <span className="max-w-[9rem] truncate">{profile?.full_name?.split(' ')[0] || t('top.account')}</span>
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${panel === 'profile' ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Handy (< 901 px): schmale Leiste oben und feste Tab-Leiste unten; dieselben Fenster wie am Desktop. */}
      <div className="operator-topbar-mobile fixed inset-x-0 top-0 z-[70] flex h-12 items-center gap-1 bg-[var(--sidebar-bg)] pl-4 pr-2 shadow-[0_2px_10px_rgba(0,0,0,0.12)] min-[901px]:hidden">
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-white/90">{parkName ?? ''}</p>
        <BarButton label={t('top.help')} active={panel === 'help'} onClick={() => toggle('help')}>
          <HelpCircle className="h-[18px] w-[18px]" />
        </BarButton>
        <BarButton label={t('top.notifications')} active={panel === 'notifications'} onClick={() => toggle('notifications')}>
          <Bell className="h-[18px] w-[18px]" />
          {unread > 0 && (
            <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-[var(--sidebar-bg)]">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </BarButton>
        <button
          type="button"
          onClick={() => toggle('profile')}
          aria-label={t('top.account')}
          aria-expanded={panel === 'profile'}
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-[11px] font-semibold text-white">{initials(name)}</span>
        </button>
      </div>
      <MobileTabBar
        unread={unread}
        notificationsOpen={panel === 'notifications'}
        onNotifications={() => toggle('notifications')}
        onMore={() => {
          setPanel(null);
          onOpenNav?.();
        }}
      />

      <NotificationsDrawer open={panel === 'notifications'} onClose={() => setPanel(null)} feed={feed} />
      {panel === 'help' && <HelpCenter onClose={() => setPanel(null)} />}
      {panel === 'profile' && <ProfileMenu onClose={() => setPanel(null)} />}
    </>
  );
}

function MobileTabBar({
  unread,
  notificationsOpen,
  onNotifications,
  onMore,
}: {
  unread: number;
  notificationsOpen: boolean;
  onNotifications: () => void;
  onMore: () => void;
}) {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const link = (to: string, label: string, Icon: typeof Bell) => {
    const active = !notificationsOpen && (to === '/' ? pathname === '/' : pathname.startsWith(to));
    return (
      <button
        key={to}
        type="button"
        onClick={() => navigate(to)}
        aria-current={active ? 'page' : undefined}
        className={`flex min-h-[52px] flex-col items-center justify-center gap-0.5 text-[11px] ${active ? 'text-white' : 'text-white/60'}`}
      >
        <Icon className="h-5 w-5" />
        <span className="max-w-full truncate px-1">{label}</span>
      </button>
    );
  };
  return (
    <nav
      aria-label={t('nav.more')}
      className="operator-tabbar-mobile fixed inset-x-0 bottom-0 z-[70] grid grid-cols-5 border-t border-white/10 bg-[var(--sidebar-bg)] pb-[calc(env(safe-area-inset-bottom,0px)+10px)] min-[901px]:hidden"
    >
      {link('/', t('nav.overview'), LayoutDashboard)}
      {link('/revenue', t('nav.revenue'), DollarSign)}
      {link('/health', t('nav.system_health'), Activity)}
      <button
        type="button"
        onClick={onNotifications}
        aria-pressed={notificationsOpen}
        className={`relative flex min-h-[52px] flex-col items-center justify-center gap-0.5 text-[11px] ${notificationsOpen ? 'text-white' : 'text-white/60'}`}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute left-1/2 top-1.5 ml-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold leading-none text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
        <span className="max-w-full truncate px-1">{t('top.notifications')}</span>
      </button>
      <button type="button" onClick={onMore} className="flex min-h-[52px] flex-col items-center justify-center gap-0.5 text-[11px] text-white/60">
        <Menu className="h-5 w-5" />
        <span className="max-w-full truncate px-1">{t('nav.more')}</span>
      </button>
    </nav>
  );
}

function BarButton({ label, active, onClick, href, children }: { label: string; active?: boolean; onClick?: () => void; href?: string; children: ReactNode }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={href ? () => navigate(href) : onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`relative flex h-9 w-9 items-center justify-center rounded-full text-white/75 transition hover:bg-white/10 hover:text-white ${active ? 'bg-white/15 text-white' : ''}`}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------- Benachrichtigungen */

const KIND_ICON: Record<FeedItem['kind'], typeof Bell> = {
  support: MessageSquare,
  fault: AlertTriangle,
  offline: WifiOff,
  paper: Printer,
  code: AlertTriangle,
  coins: Coins,
};

function NotificationsDrawer({ open, onClose, feed }: { open: boolean; onClose: () => void; feed: NotificationFeed }) {
  const { t } = useI18n();
  const locale = useLocaleTag();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'unread' | 'all' | 'trash'>('unread');
  const list = tab === 'unread' ? feed.unread : tab === 'all' ? feed.all : feed.trash;

  function show(item: FeedItem) {
    feed.markRead(item.id);
    onClose();
    navigate(item.link);
  }

  return (
    <div className={`fixed inset-0 z-[80] ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      <div
        className={`absolute inset-0 bg-black/20 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-label={t('top.notifications')}
        className={`absolute right-0 top-0 flex h-full w-full max-w-[440px] flex-col bg-white shadow-[-12px_0_32px_rgba(16,24,40,0.16)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-6 pb-2 pt-5">
          <h2 className="text-[22px] font-light text-[color:var(--ink)]">{t('top.notifications')}</h2>
          <button type="button" onClick={onClose} aria-label={t('nav.close')} className="rounded-full p-1.5 text-[color:var(--ink-3)] hover:bg-slate-100 hover:text-[color:var(--ink)]" title={t('nav.close')}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-end border-b border-[color:var(--line)] px-6">
          {(
            [
              ['unread', `${t('top.unread')} (${feed.unread.length})`],
              ['all', t('top.all')],
              ['trash', t('top.trash')],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`-mb-px mr-6 border-b-[3px] pb-2.5 pt-2 text-sm font-medium transition ${
                tab === key ? 'border-[color:var(--ink)] text-[color:var(--ink)]' : 'border-transparent text-[color:var(--ink-3)] hover:text-[color:var(--ink)]'
              }`}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              onClose();
              navigate('/settings#benachrichtigungen');
            }}
            title={t('top.notification_settings')}
            aria-label={t('top.notification_settings')}
            className="mb-1.5 ml-auto rounded-full p-1.5 text-[color:var(--ink-3)] hover:bg-slate-100 hover:text-[color:var(--ink)]"
          >
            <Settings className="h-[18px] w-[18px]" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {list.length > 0 && (
            <div className="flex justify-end px-6 pt-3">
              {tab === 'unread' && (
                <button type="button" onClick={feed.markAllRead} className="text-xs font-medium text-brand-700 hover:text-brand-800">
                  {t('top.mark_all_read')}
                </button>
              )}
              {tab === 'trash' && (
                <button type="button" onClick={feed.emptyTrash} className="text-xs font-medium text-rose-700 hover:text-rose-800">
                  {t('top.empty_trash')}
                </button>
              )}
            </div>
          )}

          {list.length === 0 ? (
            <EmptyNotifications tab={tab} onSettings={() => { onClose(); navigate('/settings#benachrichtigungen'); }} />
          ) : (
            <ul className="space-y-3 px-6 py-3">
              {list.map((item) => {
                const Icon = KIND_ICON[item.kind] ?? Bell;
                const read = feed.isRead(item.id);
                const inTrash = tab === 'trash';
                return (
                  <li key={item.id} className="rounded-lg border border-[color:var(--line-strong)] bg-white p-4">
                    <div className="flex gap-3">
                      <span
                        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                          item.severity === 'error' ? 'bg-rose-50 text-rose-600' : item.severity === 'warning' ? 'bg-amber-50 text-amber-700' : 'bg-sky-50 text-sky-600'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-2">
                          <p className={`flex-1 text-sm leading-snug text-[color:var(--ink)] ${read ? 'font-medium' : 'font-semibold'}`}>{item.title}</p>
                          {!read && !inTrash && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-label={t('top.unread')} />}
                        </div>
                        <p className="mt-1 line-clamp-3 break-words text-sm text-[color:var(--ink-2)]">{item.text}</p>
                        <p className="mt-1.5 text-xs text-[color:var(--ink-3)]">{formatRelative(item.createdAt, locale)}</p>
                        <div className="mt-3 flex items-center gap-2">
                          {!inTrash && (
                            <button type="button" onClick={() => show(item)} className="rounded-full border border-[color:var(--ink-2)] px-3.5 py-1 text-sm text-[color:var(--ink)] hover:bg-slate-50">
                              {t('top.show')}
                            </button>
                          )}
                          {inTrash ? (
                            <>
                              <RoundAction label={t('top.restore')} onClick={() => feed.restore(item.id)}>
                                <RotateCcw className="h-4 w-4" />
                              </RoundAction>
                              <RoundAction label={t('top.delete_forever')} onClick={() => feed.deleteForever(item.id)}>
                                <Ban className="h-4 w-4" />
                              </RoundAction>
                            </>
                          ) : (
                            <>
                              <RoundAction label={read ? t('top.mark_unread') : t('top.mark_read')} onClick={() => feed.markRead(item.id, !read)}>
                                {read ? <Mail className="h-4 w-4" /> : <MailOpen className="h-4 w-4" />}
                              </RoundAction>
                              <RoundAction label={t('top.move_to_trash')} onClick={() => feed.moveToTrash(item.id)}>
                                <Trash2 className="h-4 w-4" />
                              </RoundAction>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

function RoundAction({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-full border border-[color:var(--ink-2)] text-[color:var(--ink-2)] transition hover:bg-slate-50 hover:text-[color:var(--ink)]"
    >
      {children}
    </button>
  );
}

function EmptyNotifications({ tab, onSettings }: { tab: 'unread' | 'all' | 'trash'; onSettings: () => void }) {
  const { t } = useI18n();
  if (tab === 'trash') {
    return <p className="px-6 py-10 text-center text-sm text-[color:var(--ink-3)]">{t('top.trash_empty')}</p>;
  }
  return (
    <div className="flex min-h-full flex-col">
      <p className="border-b border-[color:var(--line)] px-6 py-4 text-center text-sm font-semibold text-[color:var(--ink)]">
        {tab === 'unread' ? t('top.no_unread') : t('top.no_notifications')}
      </p>
      <div className="flex-1 bg-slate-50 px-8 py-8 text-center">
        <p className="text-[20px] font-light leading-snug text-[color:var(--ink)]">{t('top.empty_title')}</p>
        <div className="mx-auto mt-6 max-w-sm space-y-3 text-left">
          {[
            { title: t('top.example_support'), action: t('top.example_support_action') },
            { title: t('top.example_paper'), action: t('top.example_paper_action') },
          ].map((example) => (
            <div key={example.title} className="rounded-lg border border-[color:var(--line-strong)] bg-white p-4 opacity-90">
              <p className="text-sm font-semibold text-[color:var(--ink)]">{example.title}</p>
              <div className="mt-2.5 flex items-center gap-2" aria-hidden>
                <span className="rounded-full border border-[color:var(--ink-2)] px-3 py-0.5 text-xs text-[color:var(--ink)]">{example.action}</span>
                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[color:var(--ink-2)] text-[color:var(--ink-2)]"><MailOpen className="h-3.5 w-3.5" /></span>
                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[color:var(--ink-2)] text-[color:var(--ink-2)]"><Trash2 className="h-3.5 w-3.5" /></span>
              </div>
            </div>
          ))}
        </div>
        <p className="mx-auto mt-6 max-w-sm text-sm leading-relaxed text-[color:var(--ink-2)]">{t('top.empty_text')}</p>
        <button type="button" onClick={onSettings} className="glass-button-primary mt-6">
          {t('top.notification_settings')}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- Hilfe-Center */

function HelpCenter({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [shown, setShown] = useState(false);
  const dragStart = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return articlesForPath(pathname);
    return HELP_ARTICLES.filter((a) => `${t(`help.${a.id}.title`)} ${t(`help.${a.id}.body`)}`.toLowerCase().includes(q));
  }, [q, pathname, t]);

  function onDragStart(e: ReactPointerEvent) {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y };
  }
  function onDragMove(e: ReactPointerEvent) {
    const d = dragStart.current;
    if (!d) return;
    setOffset({ x: d.ox + e.clientX - d.px, y: Math.max(-40, d.oy + e.clientY - d.py) });
  }

  function go(path: string) {
    navigate(path);
    setMinimized(true);
  }

  if (minimized) {
    return (
      <div className="fixed bottom-4 right-4 z-[85] flex items-center gap-2 rounded-full bg-[var(--sidebar-bg)] py-2 pl-4 pr-2 text-sm text-white shadow-lg">
        <HelpCircle className="h-4 w-4" />
        {t('top.help_center')}
        <button type="button" onClick={() => setMinimized(false)} aria-label={t('top.expand')} className="rounded-full p-1.5 hover:bg-white/10">
          <Maximize2 className="h-4 w-4" />
        </button>
        <button type="button" onClick={onClose} aria-label={t('nav.close')} className="rounded-full p-1.5 hover:bg-white/10" title={t('nav.close')}>
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-label={t('top.help_center')}
      style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${shown ? 1 : 0.96})` }}
      className={`fixed right-4 top-14 z-[85] flex max-h-[calc(100vh-5rem)] w-[min(560px,calc(100vw-2rem))] origin-top-right flex-col overflow-hidden rounded-lg border border-[color:var(--line)] bg-white shadow-[0_16px_48px_rgba(16,24,40,0.22)] transition-[opacity,transform] duration-200 ease-out ${
        shown ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={() => (dragStart.current = null)}
        className="cursor-grab border-b border-[color:var(--line)] px-6 pb-4 pt-2 active:cursor-grabbing"
        style={{ touchAction: 'none' }}
      >
        <div className="mb-1 flex justify-center" aria-hidden>
          <span className="grid grid-cols-3 gap-[3px]">
            {Array.from({ length: 6 }).map((_, i) => (
              <span key={i} className="h-[3px] w-[3px] rounded-full bg-[color:var(--ink-3)]" />
            ))}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <h2 className="text-[22px] font-light text-[color:var(--ink)]">{t('top.help_center')}</h2>
          <div className="flex items-center gap-1" onPointerDown={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setMinimized(true)} aria-label={t('top.minimize')} title={t('top.minimize')} className="rounded-full p-1.5 text-[color:var(--ink-3)] hover:bg-slate-100 hover:text-[color:var(--ink)]">
              <Minimize2 className="h-4 w-4" />
            </button>
            <button type="button" onClick={onClose} aria-label={t('nav.close')} className="rounded-full p-1.5 text-[color:var(--ink-3)] hover:bg-slate-100 hover:text-[color:var(--ink)]" title={t('nav.close')}>
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <label className="relative block">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('top.search_help')}
            className="w-full rounded-full border border-[color:var(--line-strong)] bg-white py-2.5 pl-5 pr-11 text-sm text-[color:var(--ink)] outline-none focus:border-brand-600"
          />
          <Search className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--ink-3)]" />
        </label>

        <p className="mt-5 text-sm text-[color:var(--ink-2)]">
          {q ? t('top.results', { count: results.length }) : <>{t('top.help_for')} <span className="font-semibold text-[color:var(--ink)]">{t(pageLabelKey(pathname))}</span></>}
        </p>

        <ul className="mt-2 divide-y divide-[color:var(--line)]">
          {results.map((a) => {
            const open = openId === a.id;
            return (
              <li key={a.id}>
                <button type="button" onClick={() => setOpenId(open ? null : a.id)} aria-expanded={open} className="flex w-full items-center gap-3 py-3 text-left">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                    <BookOpen className="h-4 w-4" />
                  </span>
                  <span className="flex-1 text-sm font-semibold text-[color:var(--ink)]">{t(`help.${a.id}.title`)}</span>
                  <ChevronRight className={`h-4 w-4 text-[color:var(--ink-3)] transition-transform ${open ? 'rotate-90' : ''}`} />
                </button>
                {open && (
                  <div className="pb-4 pl-12 pr-2">
                    <p className="text-sm leading-relaxed text-[color:var(--ink-2)]">{t(`help.${a.id}.body`)}</p>
                    {a.link !== pathname && (
                      <button type="button" onClick={() => go(a.link)} className="mt-2 text-sm font-semibold text-brand-700 hover:text-brand-800">
                        {t('top.go_to_page')} →
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
          {results.length === 0 && <li className="py-4 text-sm text-[color:var(--ink-3)]">{t('top.no_results')}</li>}
        </ul>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <QuickLink icon={Play} label={t('top.start_tour')} onClick={() => { startTour(); setMinimized(true); }} />
          <QuickLink icon={FileQuestion} label={t('top.faq')} onClick={() => go('/configuration/faq')} />
        </div>
      </div>

      <div className="border-t border-[color:var(--line)] px-6 py-5">
        <h3 className="text-base font-semibold text-[color:var(--ink)]">{t('nav.support')}</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <PillLink icon={LifeBuoy} label={t('top.ticket')} onClick={() => go('/tickets')} />
          <PillLink icon={Mail} label={t('top.email')} href={`mailto:${SUPPORT_EMAIL}`} />
          <PillLink icon={Phone} label={t('top.call')} href={SUPPORT_PHONE_HREF} />
        </div>
        <p className="mt-3 text-xs text-[color:var(--ink-3)]">
          {t('top.call_line', { phone: SUPPORT_PHONE })} · <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-brand-700 hover:text-brand-800">{SUPPORT_EMAIL}</a>
        </p>
      </div>
    </div>
  );
}

function QuickLink({ icon: Icon, label, onClick }: { icon: typeof Bell; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-2.5 rounded-lg border border-[color:var(--line)] px-3 py-2.5 text-left text-sm font-medium text-[color:var(--ink)] transition hover:border-brand-300">
      <Icon className="h-4 w-4 text-brand-700" />
      {label}
    </button>
  );
}

function PillLink({ icon: Icon, label, onClick, href }: { icon: typeof Bell; label: string; onClick?: () => void; href?: string }) {
  const cls = 'flex items-center justify-center gap-2 rounded-full border border-[color:var(--ink-2)] px-4 py-2 text-sm text-[color:var(--ink)] transition hover:bg-slate-50';
  return href ? (
    <a href={href} className={cls}>
      <Icon className="h-4 w-4" />
      {label}
    </a>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

/* ------------------------------------------------------------- Profil */

function ProfileMenu({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { profile, currentOrg, isOwner, isStaff, signOut } = useAuth();
  const { parkName, setPark } = usePark();
  const entitlements = useEntitlements();
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    function onDown(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (ref.current?.contains(target) || target.closest('.operator-topbar')) return;
      onClose();
    }
    document.addEventListener('mousedown', onDown);
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener('mousedown', onDown);
    };
  }, [onClose]);

  const name = profile?.full_name || profile?.email || '';
  const go = (path: string) => {
    onClose();
    navigate(path);
  };

  return (
    <div
      ref={ref}
      role="menu"
      className={`fixed right-3 top-[52px] z-[85] w-80 origin-top-right overflow-hidden rounded-lg border border-[color:var(--line)] bg-white shadow-[0_16px_40px_rgba(16,24,40,0.18)] transition-[opacity,transform] duration-150 ease-out ${
        shown ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
      }`}
    >
      <div className="flex gap-4 border-b border-[color:var(--line)] p-5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-100 text-base font-semibold text-[color:var(--ink-2)]">{initials(name)}</span>
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-[color:var(--ink)]">{profile?.full_name || t('top.account')}</p>
          <p className="truncate text-sm text-[color:var(--ink-3)]">{profile?.email}</p>
          {isOwner && !isStaff && (
            <button type="button" onClick={() => go('/settings')} className="mt-1 text-sm font-semibold text-brand-700 underline-offset-2 hover:underline">
              {t('top.profile_settings')}
            </button>
          )}
        </div>
      </div>

      <div className="border-b border-[color:var(--line)] px-5 py-4">
        <p className="text-xs text-[color:var(--ink-3)]">{t('top.park')}</p>
        <p className="mt-0.5 text-sm font-semibold text-[color:var(--ink)]">{parkName || '—'}</p>
        {currentOrg?.name && currentOrg.name !== parkName && <p className="text-xs text-[color:var(--ink-3)]">{currentOrg.name}</p>}
        <p className="mt-2 text-xs text-[color:var(--ink-3)]">
          {entitlements.loading ? t('app.loading') : t('plans.your_plan', { plan: t(PLAN_LABEL_KEY[entitlements.plan]) })}
          {' · '}
          <button type="button" onClick={() => go('/plaene')} className="font-medium text-brand-700 hover:underline">
            {t('shop.view_plans')}
          </button>
        </p>
      </div>

      <div className="border-b border-[color:var(--line)] py-2">
        <MenuItem icon={Play} label={t('top.start_tour')} onClick={() => { onClose(); startTour(); }} />
        {isOwner && !isStaff && <MenuItem icon={UserCog} label={t('top.manage_team')} onClick={() => go('/team')} />}
        <MenuItem icon={Package} label={t('top.upgrades')} onClick={() => go('/configuration')} />
        <MenuItem icon={CreditCard} label={t('top.orders')} onClick={() => go('/configuration/bestellungen')} />
        <MenuItem icon={LifeBuoy} label={t('top.my_tickets')} onClick={() => go('/tickets')} />
      </div>

      <div className="flex items-center justify-between px-5 py-3 text-sm">
        <button
          type="button"
          onClick={async () => {
            onClose();
            setPark(null, null);
            await signOut();
          }}
          className="font-semibold text-brand-700 underline-offset-2 hover:underline"
        >
          {t('nav.sign_out')}
        </button>
        <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-700 underline-offset-2 hover:underline">
          {t('top.privacy')}
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}

function MenuItem({ icon: Icon, label, onClick }: { icon: typeof Bell; label: string; onClick: () => void }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className="flex w-full items-center gap-3 px-5 py-2 text-left text-sm font-medium text-[color:var(--ink)] hover:bg-slate-50">
      <Icon className="h-4 w-4 text-[color:var(--ink-3)]" />
      {label}
    </button>
  );
}
