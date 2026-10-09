# Leiste oben rechts: Hilfe-Center, Benachrichtigungen, Profil

Stand: 10.10.2026. Code: `src/components/layout/TopBar.tsx`, Inhalte `src/lib/helpContent.ts`,
Benachrichtigungen `src/lib/notificationFeed.ts`, Texte in `src/lib/i18n.tsx` (`top.*`, `notif.*`, `help.*`).

Vorbild: HubSpot-Kopfleiste (Screenshots von John). Bei uns nur als kleine dunkle Ecke oben rechts,
immer sichtbar ab 901 px Breite (auf dem Handy ausgeblendet, dort gibt es die Navigation unten).

## 1. Benachrichtigungen (Glocke)

- Schublade gleitet von rechts herein (300 ms, `cubic-bezier(0.22,1,0.36,1)`), Hintergrund leicht abgedunkelt,
  Esc / Klick daneben schließt.
- Reiter: **Ungelesen (n)**, **Alle**, **Papierkorb**; Zahnrad führt zu Einstellungen → Benachrichtigungen.
- Karte je Meldung: Titel, Text, Zeit, „Anzeigen“ (öffnet die passende Seite), Briefumschlag
  (gelesen/ungelesen), Mülleimer (Papierkorb). Im Papierkorb: Wiederherstellen, Endgültig löschen,
  „Papierkorb leeren“.
- Quellen heute: Antworten vom Support, Automat offline, Fotopapier knapp, Gerät ausgefallen,
  Kundennummer nicht hinterlegt, Münzröhre leer. Abruf alle 2 Minuten.
- Gelesen/Papierkorb/Verlauf: im Browser je Konto und Park (localStorage). **Später:** serverseitig
  speichern, damit es auf allen Geräten gleich ist (passt zu „Notifications Schritt 3–5“ in CLAUDE.md:
  `staff_notification_preferences`, Inbox mit erledigt/archivieren/Papierkorb).

## 2. Hilfe-Center (Fragezeichen)

- Schwebendes Fenster wie bei HubSpot: oben Griff zum Verschieben, Minimieren (wird zur kleinen Leiste
  unten rechts) und Schließen. Bleibt beim Seitenwechsel offen.
- Suche über alle Artikel, darunter „Hilfe zu: <aktuelle Seite>“ mit aufklappbaren Kurzartikeln und
  „Zur Seite“.
- Schnellzugriffe: Rundgang starten, Häufige Fragen (`/configuration/faq`).
- Support: Ticket, E-Mail (info@liftpictures.com), Anrufen (+49 5222 8504-90) – Kontaktdaten wie auf
  der öffentlichen Support-Seite.

### Vorhandene Artikel (16)

| Seite | Artikel |
|---|---|
| Übersicht | Was zeigt die Übersicht? |
| Umsatz | Wie wird der Umsatz berechnet? · Bar oder Karte – woher kommt die Zahlungsart? |
| Käufe | Bar oder Karte … |
| Fotos | Wo finde ich die Fotos? |
| CRM | Wie schalten Gäste ihr Foto frei? · Kontakte exportieren |
| Personalisierung | Ein neues Overlay erstellen · Wann ist ein neues Overlay am Automaten zu sehen? · Ein Programm neu starten |
| Systemzustand | Was bedeuten die Farben? · Ein Programm neu starten · Fotopapier: wann nachfüllen? |
| Einstellungen | Bildpreis am Automaten ändern · Öffnungszeiten einstellen · Mitarbeiter hinzufügen |
| Konfiguration / Online-Shop / Speedmessung | Upgrades und Ausstattung |
| Support | So erreichst du den Support |

### Plan: was man noch schreiben bzw. einbauen könnte

1. **Saisonstart-Checkliste** (Automat einschalten, Papier, Testfoto, Preis prüfen, Öffnungszeiten) –
   als abhakbare Liste im Hilfe-Center.
2. **Störungs-Ratgeber** je Gerät: „Kamera macht keine Fotos“, „Drucker druckt nicht“, „Kartenterminal
   antwortet nicht“, „Münzprüfer nimmt nichts an“ – jeweils 3 Schritte + wann Support anrufen.
   Passt direkt an die Stationen im Systemzustand (Link „Hilfe zu diesem Gerät“).
3. **Kurzvideos** (1–2 Min.): Overlay erstellen, Papier wechseln, Neustart, CRM-Freischaltung –
   mit Vorschaubild wie bei HubSpot Academy.
4. **„Was ist neu?“** – kurze Produkt-Updates (neue Funktionen im Dashboard).
5. **Rechtliches kurz erklärt**: Fotos und Datenschutz, Gewinnspiel, Einwilligung für Werbung.
6. **Kontaktformular / Rückruf anfordern** direkt aus dem Hilfe-Center (statt nur Ticket-Seite).
7. Später: **„Erstellen“-Menü** (Plus-Symbol wie bei HubSpot): neues Overlay, neues Ticket, neuer
   Mitarbeiter, Upgrade anfragen.

## 3. Profil (Name mit Pfeil)

Minimalistisch nach HubSpot: Initialen, Name, E-Mail, „Profil & Einstellungen“; Park und Organisation;
Rundgang starten, Mitarbeiter verwalten (nur Inhaber), Upgrades & Preise, Meine Bestellungen,
Meine Support-Tickets; unten Abmelden und Datenschutz.
