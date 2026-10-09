import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { usePark } from '../contexts/ParkContext';

// Die Kamera-Seite gibt es nur, solange die Kamerasoftware erreichbar ist.
// Während die Prüfung läuft, bleibt die Seite leer statt zu springen.
export default function CameraAvailableOnly({ children }: { children: ReactNode }) {
  const { cameraControlAvailable } = usePark();
  if (cameraControlAvailable === null) return null;
  if (!cameraControlAvailable) return <Navigate to="/" replace />;
  return <>{children}</>;
}
