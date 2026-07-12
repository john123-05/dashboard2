export const FAQ_CATEGORIES = [
  'Parks & Attraktionen',
  'Kameras',
  'Interessenten & Anfragen',
  'Werbematerialien',
  'Medien',
  'Passwörter',
  'Support',
  'Health',
  'Account',
] as const;
export type FaqCategory = (typeof FAQ_CATEGORIES)[number];

export interface FaqItem {
  id: string;
  category: FaqCategory;
  question: string;
  answer: string;
  tags: string[];
}

export const faqItems: FaqItem[] = [
  {
    id: 'login-admin',
    category: 'Account',
    question: 'Wer kann sich einloggen?',
    answer:
      'Nur User, die in public.admin_users stehen. Falls Login geht, aber kein Zugriff da ist, muss die user_id in admin_users eingetragen werden.',
    tags: ['login', 'admin', 'zugriff', 'admin_users'],
  },
  {
    id: 'parks-create',
    category: 'Parks & Attraktionen',
    question: 'Wie lege ich einen neuen Park an?',
    answer:
      'Unter Parks: Name und Slug eintragen, dann Speichern. Der Slug wird für Prefix-Mapping und Ingestion-Routing genutzt.',
    tags: ['park', 'slug', 'prefix', 'anlegen'],
  },
  {
    id: 'prefix-map',
    category: 'Parks & Attraktionen',
    question: 'Wofür ist Path Prefix Mapping?',
    answer:
      'Der Prefix entscheidet, welchem Park ein Upload zugeordnet wird. Beispiel: plose-plosebob/dateiname.jpg wird Park Plose zugewiesen.',
    tags: ['prefix', 'mapping', 'ingestion', 'park_id'],
  },
  {
    id: 'attractions',
    category: 'Parks & Attraktionen',
    question: 'Wie ordne ich Attraktionen zu?',
    answer:
      'Unter Parks anlegen zuerst die Attraktion für den jeweiligen Park anlegen. Danach kann sie in Kameras für einen Kamera-Code ausgewählt werden.',
    tags: ['attraktion', 'zuordnung', 'kamera'],
  },
  {
    id: 'park-photo-wrong',
    category: 'Parks & Attraktionen',
    question: 'Was mache ich, wenn Fotos dem falschen Park zugeordnet werden?',
    answer:
      'Zuerst Path-Prefix-Mapping und Kamera-Zuordnung für den Park prüfen — darüber wird jedes Foto automatisch zugeordnet. Bei eindeutigem Fehler kann ein Foto in der Datenbank manuell umgehängt werden (Rücksprache mit Entwicklung).',
    tags: ['falscher park', 'zuordnung', 'fehler'],
  },
  {
    id: 'camera-multi-park',
    category: 'Kameras',
    question: 'Kann derselbe Kamera-Code in mehreren Parks existieren?',
    answer:
      'Ja. Beim Speichern gibt es eine Warnung, wenn der Code schon in anderen Parks verwendet wird. Speicherung ist trotzdem möglich.',
    tags: ['kamera', 'customer code', 'mehrere parks', 'warnung'],
  },
  {
    id: 'camera-images',
    category: 'Kameras',
    question: 'Warum sehe ich manchmal 0 Bilder bei einer Kamera?',
    answer:
      'Erst wird im ausgewählten Park gesucht. Wenn dort nichts gefunden wird, nutzt das Dashboard parkübergreifenden Fallback über customer_code.',
    tags: ['kamera-bilder', 'fallback', '0 bilder', 'photos'],
  },
  {
    id: 'camera-add',
    category: 'Kameras',
    question: 'Wie füge ich eine neue Kamera-Zuordnung hinzu?',
    answer:
      'Auf der Kameras-Seite unter „Neue Kamera-Zuordnung“: Park, Attraktion und 4-stelligen Kamera-Code eintragen und speichern.',
    tags: ['kamera hinzufügen', 'zuordnung', 'code'],
  },
  {
    id: 'leads-four-lists',
    category: 'Interessenten & Anfragen',
    question: 'Was sind die vier Listen bei Interessenten und Anfragen?',
    answer:
      'PDF E-Mail (aus dem Info-PDF-Formular), Anfrage International (onridepictures.com), Anfrage Deutschland (liftpictures.com) und Produktfinder (Assessment-Tool). Jede hat eine eigene Herkunft, Kontakt-Historie wird aber über die E-Mail-Adresse listenübergreifend zusammengeführt.',
    tags: ['pdf', 'international', 'deutschland', 'produktfinder', 'listen', 'tabs'],
  },
  {
    id: 'leads-contact-mark',
    category: 'Interessenten & Anfragen',
    question: 'Wie markiere ich, dass ein Kontakt kontaktiert wurde?',
    answer:
      'Bei jeder Karte gibt es unter der Temperatur-Auswahl ein Datumsfeld + „+ Kontakt“-Button. Datum wählen (Standard: heute) und klicken — der Kontakt wird protokolliert, auch mehrfach möglich.',
    tags: ['kontaktiert', 'kontakt hinzufügen', 'button', 'datum'],
  },
  {
    id: 'leads-contact-backdate',
    category: 'Interessenten & Anfragen',
    question: 'Kann ich einen Kontakt auch rückwirkend eintragen?',
    answer:
      'Ja. Das Datumsfeld lässt sich auf ein beliebiges vergangenes Datum setzen (kein Datum in der Zukunft), bevor auf „+ Kontakt“ geklickt wird — praktisch, um Kontakte nachzutragen, die schon vor der Nutzung dieser Funktion stattfanden.',
    tags: ['rückwirkend', 'nachtragen', 'vergangenheit'],
  },
  {
    id: 'leads-stats',
    category: 'Interessenten & Anfragen',
    question: 'Was zeigt „Statistik anzeigen“?',
    answer:
      '„Statistik anzeigen“ neben „Details anzeigen“ öffnet eine Zeitleiste: Punkte zeigen jeden Kontaktzeitpunkt proportional zueinander, darunter eine Liste mit Datum, Quelle (PDF/Intl./DE/Finder) und Lösch-Button pro Eintrag.',
    tags: ['statistik', 'timeline', 'zeitleiste', 'verlauf'],
  },
  {
    id: 'leads-cross-list',
    category: 'Interessenten & Anfragen',
    question: 'Warum erscheint ein Kontakt auch in einer anderen Liste?',
    answer:
      'Kontakte werden über die E-Mail-Adresse gespeichert, nicht pro Liste. Wurde jemand z. B. unter „Anfrage International“ kontaktiert und taucht dieselbe E-Mail auch bei „PDF E-Mail“ auf, erscheint der Kontakt-Eintrag dort automatisch mit — inklusive Badge, aus welcher Liste er stammt.',
    tags: ['email', 'übergreifend', 'mehrere listen', 'automatisch'],
  },
  {
    id: 'leads-temperature',
    category: 'Interessenten & Anfragen',
    question: 'Wie ändere ich die Temperatur eines Kontakts?',
    answer: 'Über das Dropdown in der Aktionsspalte jeder Karte: Heiß, Medium oder Kalt. Wird sofort gespeichert.',
    tags: ['temperatur', 'heiß', 'kalt', 'medium', 'priorität'],
  },
  {
    id: 'leads-delete',
    category: 'Interessenten & Anfragen',
    question: 'Wie lösche ich einen einzelnen Kontakt?',
    answer:
      'Über den „Löschen“-Button unten in der Aktionsspalte jeder Karte, mit Sicherheitsabfrage. Gilt für alle vier Listen einzeln pro Kontakt.',
    tags: ['löschen', 'entfernen'],
  },
  {
    id: 'leads-import',
    category: 'Interessenten & Anfragen',
    question: 'Wie importiere ich neue Kontakte per CSV?',
    answer:
      'Über „CSV importieren“ am Anfang jeder Liste. Bereits vorhandene Einträge (gleiche E-Mail + Zeitstempel) werden automatisch erkannt und nicht doppelt angelegt.',
    tags: ['csv', 'import', 'hochladen', 'duplikate'],
  },
  {
    id: 'leads-search',
    category: 'Interessenten & Anfragen',
    question: 'Wie durchsuche ich die Interessenten-Liste?',
    answer: 'Die Suchleiste oben auf der Seite filtert die aktuell aktive Liste nach Name, E-Mail, Firma und weiteren Feldern.',
    tags: ['suche', 'filtern'],
  },
  {
    id: 'materials-find',
    category: 'Werbematerialien',
    question: 'Wo finde ich PDFs und Kataloge für Interessenten?',
    answer:
      'Unter Werbematerialien: allgemeine Kataloge, Attraktions-PDFs (DE/EN), Uploader-Anleitungen sowie Social-Media- und Website-Links — alles zum Download oder Link-Kopieren.',
    tags: ['pdf', 'katalog', 'broschüre', 'download'],
  },
  {
    id: 'materials-attraction-match',
    category: 'Werbematerialien',
    question: 'Welches PDF passt zu welcher Attraktion?',
    answer:
      'Attraktions-PDFs sind nach Kategorie sortiert (Onride, Wasser, Alpine, Stationär, Messen) und liegen jeweils auf Deutsch und Englisch vor — passend zur Anfrageart des Interessenten.',
    tags: ['attraktion', 'pdf', 'sprache'],
  },
  {
    id: 'media-upload',
    category: 'Medien',
    question: 'Wie lade ich neue Bilder oder Videos hoch?',
    answer:
      'Über „+ Medien hinzufügen“ auf der Medien-Seite: Datei, Titel, Kategorie und Stichworte angeben. Stichworte verbessern später die Trefferquote bei der Suche.',
    tags: ['upload', 'hochladen', 'medien hinzufügen'],
  },
  {
    id: 'media-search',
    category: 'Medien',
    question: 'Wie durchsuche ich die Medienbibliothek?',
    answer: 'Das Suchfeld durchsucht Titel, Unterkategorie und Stichworte; die Kategorie-Auswahl schränkt zusätzlich ein.',
    tags: ['suche', 'filtern', 'kategorie'],
  },
  {
    id: 'media-bulk-delete',
    category: 'Medien',
    question: 'Kann ich mehrere Medien auf einmal löschen?',
    answer: 'Über „Auswählen“ lassen sich mehrere Medien markieren und gemeinsam über „Ausgewählte löschen“ entfernen.',
    tags: ['löschen', 'mehrfachauswahl', 'bulk'],
  },
  {
    id: 'passwords-find',
    category: 'Passwörter',
    question: 'Wo finde ich Zugangsdaten, z. B. das LinkedIn-Passwort?',
    answer:
      'Unter Passwörter: alle internen Zugangsdaten — Kunden-Logins, Park-Passwörter, Social Media (z. B. LinkedIn), Tools. Über die Suche oben auf dieser Seite oder direkt auf der Passwörter-Seite schnell auffindbar.',
    tags: ['passwort', 'zugangsdaten', 'linkedin', 'login', 'social media'],
  },
  {
    id: 'passwords-add',
    category: 'Passwörter',
    question: 'Wie lege ich ein neues Passwort an?',
    answer:
      '„Neues Passwort anlegen“ oben auf der Passwörter-Seite: Bezeichnung und Passwort sind Pflicht, Kategorie/Name/Login/Notiz optional.',
    tags: ['passwort anlegen', 'neu', 'speichern'],
  },
  {
    id: 'passwords-security',
    category: 'Passwörter',
    question: 'Wer kann die Passwörter sehen?',
    answer:
      'Nur eingeloggte Admins (Einträge in admin_users) sehen diese Seite. Passwörter sind standardmäßig maskiert und werden erst nach Klick auf „Anzeigen“ im Klartext angezeigt.',
    tags: ['sicherheit', 'admin', 'zugriff', 'maskiert'],
  },
  {
    id: 'support-sync',
    category: 'Support',
    question: 'Wie funktioniert Support Ticket Kunden?',
    answer: 'Die Seite zeigt synchronisierte Tickets. Die Einspeisung läuft über die Edge Function support-sync mit SUPPORT_SYNC_SECRET.',
    tags: ['support', 'tickets', 'sync', 'webhook'],
  },
  {
    id: 'ingestion-check',
    category: 'Health',
    question: 'Was macht der Ingestion Check?',
    answer:
      'Unter Health zeigt er Prefix-Routing, Parsing und Kamera/Attraktions-Match für einen Dateipfad. So kann man Parsing-Probleme schnell debuggen.',
    tags: ['ingestion', 'parser', 'debug', 'dateiname', 'health'],
  },
  {
    id: 'no-new-photos',
    category: 'Health',
    question: 'Warum kommen keine neuen Fotos an?',
    answer:
      'Erst Kamera/Zuordnung/Trigger im Operator-Dashboard prüfen. Kommt trotzdem nichts an: Supabase-Speicherkontingent (Storage-Quota) des Projekts prüfen — ist der Speicher voll, werden neue Uploads stillschweigend abgelehnt, ganz ohne Fehlermeldung im Dashboard.',
    tags: ['fotos fehlen', 'ingestion', 'speicher', 'quota', 'storage'],
  },
  {
    id: 'darkmode',
    category: 'Account',
    question: 'Wie aktiviere ich Dark Mode?',
    answer: 'Im Header auf Dunkelmodus/Hellmodus klicken. Die Auswahl wird gespeichert und bleibt nach dem Neuladen erhalten.',
    tags: ['dark mode', 'theme', 'anzeige'],
  },
  {
    id: 'search-page',
    category: 'Account',
    question: 'Was durchsucht die Suchleiste auf dieser Seite?',
    answer:
      'Sie durchsucht gleichzeitig Passwörter, Medien, Werbematerialien, Kontakte/Anfragen, Links und diese FAQ. Ein Treffer führt direkt zur passenden Seite bzw. öffnet das Dokument oder den FAQ-Eintrag.',
    tags: ['suche', 'suchleiste', 'global'],
  },
  {
    id: 'not-found',
    category: 'Account',
    question: 'Ich finde etwas nicht — was tue ich?',
    answer: 'Tags unter den FAQ-Einträgen anklicken, um verwandte Fragen zu finden, oder direkt im Team nachfragen.',
    tags: ['nichts gefunden', 'hilfe', 'kontakt team'],
  },
];

export function matchesFaqQuery(item: FaqItem, q: string): boolean {
  if (!q) return true;
  return (
    item.question.toLowerCase().includes(q) ||
    item.answer.toLowerCase().includes(q) ||
    item.tags.some((tag) => tag.toLowerCase().includes(q))
  );
}
