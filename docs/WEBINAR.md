# Öffentliche Webinar-Landingpage

https://dashboard-liftpictures.com/webinar · Dienstag, 3. November 2026, 17 Uhr MEZ.

Die eigenständige deutsche Kampagnenseite liegt in public/webinar/index.html, ihre Bilder unter public/webinar/img. Sie benötigt keinen Dashboard-Login. public/_redirects liefert /webinar und /webinar/ direkt aus; die öffentliche React-Route fängt auch SPA-Fallbacks und den lokalen Vite-Server ab. Das normale Dashboard bleibt unter /.

Das Formular ruft die Supabase-Function webinar-register im gemeinsamen Liftpictures-Projekt kvpcwlcfgmsmarjtwpsx auf. Der öffentliche anon-Schlüssel ist kein Benutzerlogin und kein Servergeheimnis. Erst wenn Kontakt und verknüpfte Webinar-Anmeldung gespeichert sind, erscheint die Bestätigung. Backend und CRM-Kennzeichnung liegen im Repository john123-05/liftpictures-crm (docs/WEBINAR.md). Der Linkversand zum Webinar wird separat organisiert.

Geprüft am 20.10.2026: check:i18n, typecheck und build erfolgreich; Aufruf /webinar ohne Anmeldung im Browser, Formular bis zur erfolgreichen Bestätigung, vorhandene Bildpfade und Kalendertermin geprüft. Lokale Vorschau während dieser Sitzung: http://127.0.0.1:5192/webinar (5180 war vom ursprünglichen eigenständigen Webinar-Projekt belegt).

Hosting: Die Produktionsdomain antwortet über Netlify. Laut aktueller Projektanleitung kann zusätzlich ein Publish in Bolt nötig sein; nach einem GitHub-Push den Live-Inhalt prüfen und gegebenenfalls das verbundene Bolt-Projekt veröffentlichen.

Live-Prüfung nach Veröffentlichung: /webinar führt per 301 auf /webinar/ und liefert dort die Landingpage (HTTP 200) mit dem neuen Anmelde-Endpunkt. Alle 21 Bildadressen erreichbar. Formular live erfolgreich abgesendet; schmale Darstellung bei 375 CSS-Pixeln ohne horizontalen Überlauf geprüft.

## Bildkarten (20.10.2026)

Die fünf Karten starten gleich breit mit identischen Abständen. Die Reihe wächst beim Scrollen von eingerückt auf fast volle Bildschirmbreite. Erst Hover oder Tastaturfokus vergrößert eine Karte moderat (Faktor 1,85); beim Verlassen werden alle wieder gleich breit. Mini-Demos starten nur auf der aktiven Karte; ein Klick öffnet weiterhin die große Demo. Mobil bleibt die Wischleiste erhalten, bei reduzierten Bewegungen entfällt die Scrollanimation.
