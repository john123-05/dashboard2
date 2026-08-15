const STORAGE_BASE = 'https://xcrxltiiovpoladpaewd.supabase.co/storage/v1/object/public/test';

function storageUrl(filename: string): string {
  return `${STORAGE_BASE}/${encodeURIComponent(filename)}`;
}

export type MaterialLanguage = 'de' | 'en';

export interface MaterialDoc {
  id: string;
  title: string;
  language: MaterialLanguage;
  description: string;
  url: string;
}

// General brochures — not attraction-specific, not the uploader install guide.
export const generalDocs: MaterialDoc[] = [
  {
    id: 'catalog-2026',
    title: 'Firmenkatalog 2026',
    language: 'en',
    description:
      'Der große Gesamtkatalog: alle Systeme (Onride, EasyCam, PhotoPoint), Verkaufswege und Zusatzfunktionen. Guter erster Überblick für neue Interessenten.',
    url: storageUrl('LiftpicturesCatalog2026.pdf'),
  },
  {
    id: 'support-manual',
    title: 'Support-Handbuch',
    language: 'en',
    description:
      'Erklärt unseren Support- und Ersatzteil-Prozess in einfacher Sprache. Ideal für internationale Kunden, die fragen: "Was passiert, wenn etwas kaputtgeht?"',
    url: storageUrl('Support Manual.pdf'),
  },
];

export interface AttractionMaterial {
  id: string;
  category: string;
  description: string;
  de: string;
  en: string;
}

// Same attraction, two languages each — always shown as a DE/EN pair.
export const attractionMaterials: AttractionMaterial[] = [
  {
    id: 'onride',
    category: 'Onride-Attraktionen',
    description: 'Kamera direkt an der Fahrt montiert – Alpine Coaster, Achterbahnen & Co. Das Kernprodukt ("ONRIDECAM" im Katalog).',
    de: storageUrl('Onride.pdf'),
    en: storageUrl('OnrideEglisch.pdf'),
  },
  {
    id: 'water',
    category: 'Wasser-Attraktionen',
    description: 'Für Wasserrutschen und ähnliche Wasser-Attraktionen.',
    de: storageUrl('Wasser Attraktionen.pdf'),
    en: storageUrl('Waterenglisch.pdf'),
  },
  {
    id: 'alpine',
    category: 'Alpine Attraktionen',
    description: 'Speziell für Alpine Coaster / Sommerrodelbahnen.',
    de: storageUrl('Alpine Attraktionen.pdf'),
    en: storageUrl('AlpineEnglisch.pdf'),
  },
  {
    id: 'stationary',
    category: 'Stationäre Attraktionen',
    description: 'Für feste Fotostationen an Aussichtspunkten, Gipfeln oder Besucherzentren ("PhotoPoint" im Katalog).',
    de: storageUrl('stationaryattraction.pdf'),
    en: storageUrl('stationaryattractionenglisch.pdf'),
  },
  {
    id: 'messen',
    category: 'Messen & Events',
    description: 'Für den Einsatz auf Messen und bei Veranstaltungen.',
    de: storageUrl('Messe.pdf'),
    en: storageUrl('messenenglisch.pdf'),
  },
];

// Documents for the separate uploader-installation sub-page.
export const uploaderDocs: MaterialDoc[] = [
  {
    id: 'uploader-anleitung',
    title: 'Uploader-Anleitung (Quickstart)',
    language: 'de',
    description: 'Kurzanleitung: PowerShell öffnen, in den Ordner wechseln, Uploader starten.',
    url: storageUrl('Liftpic_Uploader_Anleitung.pdf'),
  },
  {
    id: 'kamera-webout-anleitung',
    title: 'Kamera, Webout & Upload – vollständige Anleitung',
    language: 'de',
    description: 'Komplette Systemübersicht: Kamera-Software, Bildverarbeitung, Upload-Reihenfolge, Fehlerbehebung.',
    url: storageUrl('Liftpictures_Kamera_Webout_Anleitung_Vollstaendig.pdf'),
  },
  {
    id: 'liftpic-sync-installer',
    title: 'install_liftpic_sync_bootstrap.ps1 (Installer)',
    language: 'de',
    description: 'Der aktuelle Ein-Datei-Installer für Liftpic Sync: lädt die Software, schreibt die .env, koppelt den PC und startet die Aufgabe.',
    url: 'https://raw.githubusercontent.com/john123-05/testsoftware/main/scripts/install_liftpic_sync_bootstrap.ps1',
  },
];

export interface SocialLink {
  id: string;
  platform: string;
  label: string;
  url: string;
}

export const socialLinks: SocialLink[] = [
  {
    id: 'linkedin-tom',
    platform: 'LinkedIn',
    label: 'Tom Nolting',
    url: 'https://www.linkedin.com/in/tom-nolting-1278703a2/',
  },
  {
    id: 'linkedin-company',
    platform: 'LinkedIn',
    label: 'Liftpictures Fotosysteme',
    url: 'https://www.linkedin.com/company/liftpictures',
  },
  {
    id: 'instagram',
    platform: 'Instagram',
    label: '@liftpictures_fotosysteme',
    url: 'https://www.instagram.com/liftpictures_fotosysteme/',
  },
  {
    id: 'facebook',
    platform: 'Facebook',
    label: 'Liftpictures Fotosysteme',
    url: 'https://www.facebook.com/people/Liftpictures-Fotosysteme/61579119519474/',
  },
];

export interface HelpfulLink {
  id: string;
  label: string;
  shortLabel?: string;
  description: string;
  url: string;
  // true for template/example URLs that aren't meant to be opened as-is.
  copyOnly?: boolean;
  // Which customer/attraction this link belongs to, shown as a badge -
  // only relevant for per-customer links (e.g. claim-page templates), not
  // company-wide ones like the main domains or Calendly.
  customer?: string;
}

export const helpfulLinks: HelpfulLink[] = [
  {
    id: 'contact',
    label: 'liftpictures-contact.com',
    shortLabel: 'PDF',
    description: 'Kontaktseite – Interessenten erhalten darüber automatisch Info-PDFs per E-Mail zugeschickt.',
    url: 'https://liftpictures-contact.com/',
  },
  {
    id: 'main-de',
    label: 'liftpictures.com',
    shortLabel: 'Deutschland',
    description: 'Hauptdomain für den deutschen Markt.',
    url: 'https://liftpictures.com',
  },
  {
    id: 'main-world',
    label: 'onridepictures.com',
    shortLabel: 'International',
    description: 'Hauptdomain für den weltweiten/internationalen Markt.',
    url: 'https://onridepictures.com',
  },
  {
    id: 'demo',
    label: 'attraktionsfotos.de',
    shortLabel: 'Demo',
    description: 'Demo-Seite: laufende Bildergalerie mit QR-Code zum Freischalten aufs Handy – guter Live-Eindruck für Interessenten.',
    url: 'https://attraktionsfotos.de',
  },
  {
    id: 'calendly',
    label: 'Termin buchen (Calendly)',
    shortLabel: 'Call',
    description: 'Schnellster Weg, ein Videocall-Gespräch zu vereinbaren.',
    url: 'https://calendly.com/kontakt-liftpictures-fotosysteme/30min',
  },
  {
    id: 'schausteller',
    label: 'onridebilder.de',
    shortLabel: 'Schausteller',
    description: 'Website speziell für Schausteller (Kirmes-/Volksfest-Betreiber).',
    url: 'https://onridebilder.de',
  },
  {
    id: 'imst-claim',
    label: 'liftpictures-fotos.de/claim?code=…',
    shortLabel: 'QR Vorlage',
    description: 'Muster-Link für die QR-Code-Bilder in Imst. In echt steht nach "code=" die jeweilige Bildnummer – kein fertiger Link zum Anklicken, nur zum Kopieren als Vorlage.',
    url: 'https://liftpictures-fotos.de/claim?code=',
    copyOnly: true,
    customer: 'Imst (Imster Bergbahnen, Alpine Coaster)',
  },
  {
    id: 'tarzans-claim',
    label: 'liftpictures-fotos-tarzans.de/claim?code=…',
    shortLabel: 'QR Vorlage',
    description: 'Muster-Link für die QR-Code-Bilder bei Tarzāns Sigulda. Noch kein echtes Hosting/Domain live – Code liegt im selben Repo wie Imst, Unterordner tarzans/. In echt steht nach "code=" die jeweilige Bildnummer – kein fertiger Link zum Anklicken, nur zum Kopieren als Vorlage.',
    url: 'https://liftpictures-fotos-tarzans.de/claim?code=',
    copyOnly: true,
    customer: 'SIA "CSS-ALPINE" / Tarzāns Sigulda (Lettland)',
  },
];
