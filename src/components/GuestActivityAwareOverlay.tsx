import type { ReactNode } from 'react';
import { usePark } from '../contexts/ParkContext';
import SpeedmessungOffer from './SpeedmessungOffer';

// The Speedmessung page only has real guest data for the parks that run the
// speed system (passwordless leaderboard/profile, see operator-guest-activity):
// CSS-ALPINE/Tarzans, Plose and Gruenberg so far. Every other park sees the
// same real page - just without data - and the retrofit offer at the bottom.
const GUEST_ACTIVITY_PARK_IDS = new Set([
  'e2da6436-6a83-4c39-add3-5f99eb6bd897', // CSS-ALPINE / Tarzans
  '3b08e092-beb5-46ec-9811-5698e86dd83a', // Plose
  '25c1022b-4e2e-4fc4-b54d-72a4ced2522b', // Gruenberg-Flitzer
]);

export default function GuestActivityAwareOverlay({ children }: { children: ReactNode }) {
  const { parkId } = usePark();

  if (parkId && GUEST_ACTIVITY_PARK_IDS.has(parkId)) {
    return <>{children}</>;
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
        <span>
          <strong>Noch nicht freigeschaltet</strong> – so sieht deine Speedmessung aus, sobald sie läuft. Zum
          Freischalten ganz nach unten scrollen.
        </span>
      </div>
      {children}
      <SpeedmessungOffer />
    </>
  );
}
