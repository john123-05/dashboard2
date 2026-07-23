import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// Routes wrapped in this only render for park owners/admins. The restricted
// "staff" role is bounced to the photos page - so revenue, purchases, overview,
// settings etc. are unreachable for staff even by typing the URL.
export default function OwnerOnly({ children }: { children: ReactNode }) {
  const { loading, isStaff } = useAuth();
  if (loading) return null;
  if (isStaff) return <Navigate to="/photos" replace />;
  return <>{children}</>;
}
