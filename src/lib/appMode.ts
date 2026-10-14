// Läuft das Dashboard in der iOS-App (Liftpictures Dashboard, ab Version 1.2)? Die App hängt ihren
// Namen an den User-Agent. Dann zeichnet die App Kopfzeile und Tab-Leiste selbst, die Seite zeigt nur
// ihren Inhalt, und die App erneuert das Anmelde-Token (die Seite tut es nicht, sonst überschreiben
// sich beide gegenseitig).
export const IN_APP = typeof navigator !== 'undefined' && /LiftpicturesDashboardApp/.test(navigator.userAgent);
