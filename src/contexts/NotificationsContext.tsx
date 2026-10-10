import { createContext, useContext, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { usePark } from './ParkContext';
import { useNotificationFeed, type NotificationFeed } from '../lib/notificationFeed';

// Ein gemeinsamer Benachrichtigungs-Feed für das ganze Dashboard: die Glocke
// oben rechts (TopBar) und die Karte „Benachrichtigungen und Aktivitäten“ auf
// der Übersicht lesen dieselben Meldungen, gelesen/Papierkorb gilt überall.

const NotificationsCtx = createContext<NotificationFeed | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { parkId } = usePark();
  const feed = useNotificationFeed(user?.id, parkId);
  return <NotificationsCtx.Provider value={feed}>{children}</NotificationsCtx.Provider>;
}

export function useNotifications(): NotificationFeed {
  const ctx = useContext(NotificationsCtx);
  if (!ctx) throw new Error('useNotifications ausserhalb von NotificationsProvider');
  return ctx;
}
