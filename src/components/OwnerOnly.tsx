import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { canSee, firstAllowedPath, pageKeyForPath } from '../lib/permissions';
import { useAuth } from '../contexts/AuthContext';

// Routes wrapped in this only render for park owners/admins. The restricted
// "staff" role is bounced to the photos page - so revenue, purchases, overview,
// settings etc. are unreachable for staff even by typing the URL.
export default function OwnerOnly({ children }: { children: ReactNode }) {
  const { loading, isStaff, isOwner, allowedPages } = useAuth();
  const { pathname } = useLocation();
  if (loading) return null;
  // Mitarbeiter mit eigener Seitenauswahl (Rechte je Seite) dürfen die gewählten Seiten sehen.
  if (isStaff && !(allowedPages && canSee(pageKeyForPath(pathname), { isOwner, isStaff, allowedPages }))) {
    return <Navigate to={firstAllowedPath({ isOwner, isStaff, allowedPages })} replace />;
  }
  return <>{children}</>;
}
