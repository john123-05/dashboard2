# Plose-Fotoprodukte: funktionsfähiger Testbetrieb

Stand: 02.11.2026. Plose: `3b08e092-beb5-46ec-9811-5698e86dd83a`.
John hat eine echte Prodigi-Anbindung für den vorhandenen Plose-Shop beauftragt,
einschließlich Handyhüllen, Versandportal und Kostenrechnung. Zunächst **keine
Umsatzaufteilung mit Plose**. Stripe und Druckaufträge bleiben im Testbetrieb.

## Seiten und Verhalten

- Gast: `https://liftpictures-fotos.de/plose/shop`.
- Alter Plose-Vorschaulink `/demo-shop/a675c745-91a0-4ae3-be49-c15c6a37967e`
  öffnet denselben neuen Shop; andere Parks bleiben unverändert.
- Betreiber: `/shop`, nach Auswahl von Plose. Vorschau, Produkte/Preise,
  Bestellungen/Versand. Lieferdaten nur nach Park-Autorisierung.
- Interne Kalkulation und Anbieter-/Margendaten nur für verifizierte
  Liftpictures-Super-Admins oder gemeinsame Staff-Admins; kein öffentlicher
  Kalkulations-Endpunkt und keine Kostendaten im Gast-Bundle.
- Kundenseitige Bestellseite nach Zahlung: Bestellstatus, Artikel, Downloads
  für tatsächlich gekaufte digitale Fotos und Sendungsverfolgung, sobald
  der Anbieter eine Sendungsnummer liefert. Der Zugangslink enthält einen
  Bearer-Schlüssel im Fragment, nicht in HTTP-Querys oder Referrern.

## Produkte und vorgeschlagene Bruttopreise

- Digitales Foto 4,99 €.
- Lustre-Abzug 13×18 cm (5×7 Zoll), `GLOBAL-PAP-5X7`: 9,90 €.
- Weiße Fototasse 11 oz, `GLOBAL-MUG-W`: 19,90 €.
- Mattes Poster 30×40 cm, `GLOBAL-FAP-12X16`: 24,90 €.
- Classic-Rahmen schwarz, Acrylglas, ohne Passepartout, 20×25 cm,
  `GLOBAL-CFP-8X10`: 59,90 €.
- Tough-Handyhülle glänzend: 34,90 €. Zwölf tatsächliche Modelle aus dem
  angemeldeten Prodigi-Katalog: iPhone 14/15/15 Pro/16/16 Pro/17/17 Pro,
  Galaxy S24/S24 Ultra/S25/S25 Ultra und Pixel 9.

Alle 16 physischen SKUs (4 Produkte und 12 Handyvarianten) wurden über die
Produkt-API auf Lieferbarkeit nach IT, DE und AT geprüft. Kein T-Shirt oder
anderes Produkt ohne korrekte Variantenauswahl wird im Plose-Pilot verkauft.
Gastpreise sind Vorschläge; Betreiber können sie serverseitig ändern.

## Bestellkette und Trennung von Test und Live

1. Fotos aus dem existierenden Plose-Fotobestand suchen, nach Datum und
   optional Uhrzeit ±15 Minuten in Europe/Rome oder Bildnummer eingrenzen.
2. Produkt, Menge, ggf. genaues Handymodell sowie Ganzbild/mittigen Zuschnitt
   wählen. Vorschauen sind auf 800 Pixel begrenzt. SKU, Attribute und Preise
   werden ausschließlich auf dem Server festgelegt.
3. Live-Prodigi-Katalog und **nicht bestellende** Quote-API liefern echte
   Produkt-/Versandkosten für den gesamten Warenkorb. Der Gast sieht einen
   Gesamtpreis einschließlich separat ausgewiesenem Versand. Getrennte Pakete
   und Fertigung außerhalb der EU werden ausgewiesen.
4. Originalauflösung wird geprüft. Effektive Auflösung unter 150 dpi wird
   angezeigt; unter 72 dpi wird der gewählte Zuschnitt abgelehnt.
   Vor Zahlung bestätigt der Gast die tatsächliche Druckfläche.
5. Stripe-Testcheckout sammelt E-Mail, Rechnungs- und Lieferadresse; ausschließlich
   Testschlüssel werden akzeptiert. Land und Gesamtbetrag werden nach Zahlung
   nochmals mit dem gespeicherten Angebot verglichen.
6. Signierter Stripe-Testwebhook und serverseitig verifizierte Rückkehrseite
   lösen dieselbe Zahlungskontrolle aus. Erst danach private Originalkopie
   und Prodigi-**Sandbox**-Auftrag. Die unveränderte Originaldatei wird mit
   `fitPrintArea` bzw. `fillPrintArea` gedruckt. Kein nur im Mockup sichtbares
   Zusatzlogo wird als Teil der Druckdatei versprochen.
7. DB-Sperre und Prodigi-`idempotencyKey` verhindern doppelte Druckaufträge.
   Statusmeldungen des Anbieters werden nicht blind übernommen: Die Function
   fragt den zugeordneten Auftrag mit dem Sandbox-Schlüssel selbst ab.

Migration und Code erlauben ausschließlich `mode='sandbox'` bzw.
`is_test=true`. Der Live-Schlüssel darf im Code nur Produktdaten und Quotes
aufrufen. Es existiert kein Live-Order-Codepfad. Die Tabellen sind RLS-geschützt
und für `anon`/`authenticated` gesperrt. Alle Betreiberaktionen prüfen Park-
und Seitenrechte. Kundenumsätze und vorhandene Automatenstatistiken werden
durch die Testbestellungen nicht verändert.

## Kalkulationsgrundlage

`_shared/photoProductCosts.ts` enthält echte Standard-Quotes vom 02.11.2026,
je ein Stück pro Bestellung, IT/DE/AT. Handybeispiel: iPhone 16 glänzend.
Der Gast-Warenkorb fragt Kosten separat neu ab; diese Datei ist eine datierte
Planungsgrundlage, keine garantierte oder dauerhaft aktuelle Preisliste.

Deckungsbeitrag = Gastzahlung ohne angenommene Verkaufs-MwSt. minus
Anbieterrechnung inkl. Versand und ggf. nicht abziehbarer Anbietersteuer,
Zahlungsgebühr und Rücklage. Vorgaben: IT 22 %, DE 19 %, AT 20 %;
Standard-EEA-Karte 1,5 % + 0,25 € als anpassbare Annahme; 3 % Rücklage.
Anbietersteuer wird zunächst vorsichtig nicht als abziehbar behandelt.

Beispiel IT: Handyhülle 34,90 € + 9,50 € Gastversand = 44,40 €.
Anbieterrechnung 25,82 €, kalkulierte Verkaufs-MwSt. 8,01 €,
Zahlungsgebühr 0,92 €, Rücklage 1,33 € => 8,32 € Deckungsbeitrag.
Bei vollständig abziehbarer ausgewiesener Anbietersteuer von 4,31 €:
12,63 €. Keine Aufteilung mit Plose, Fixkosten, Support oder Ertragsteuern.
Einzelne kleine Abzüge sind wegen des Versands weniger attraktiv als mehrere
Abzüge in einem Warenkorb. Versand wird nicht pauschal für mehrere Artikel
versprochen; die Anbieterquote entscheidet über die Kosten.

Vor einem echten Verkaufsstart sind Firmen-/Steuerdaten des Prodigi-Kontos,
Steuerbehandlung und gegebenenfalls Einfuhrkosten (Tassen wurden z.B. aus GB
angeboten), tatsächliche Stripe-Konditionen sowie rechtliche Bestelltexte und
Aufbewahrungsfristen verbindlich zu klären. Es ist noch keine Zahlungskarte
im Live-Prodigi-Konto hinterlegt. Physische Muster wurden nicht bestellt.

## Prüfung und Betrieb

- Durchgängiger Browser-Test: iPhone-16-Hülle, Italien, 44,40 € Testzahlung;
  Bestell-ID `29186156-9f69-4487-9bf0-5bff65d90e1f`,
  Prodigi Sandbox `ord_1194751`. Keine echte Belastung oder Fertigung.
- Der Original-Snapshot hat dasselbe Bildmaterial wie das Plose-Foto. Alte
  JPEG-Uploads waren als `text/plain` gespeichert; der neue Code erkennt JPEG
  und PNG anhand der Dateisignatur, bevor er sie privat sichert.
- Vier Deno-Tests: ungültige Varianten/Mengen, verworfene Clientpreise/SKUs,
  nachvollziehbare Steuer-/Gebührenrechnung und verlustbringende Warenkörbe.
- API-Prüfungen: anonyme Betreiberaktionen, falsche Zugänge, andere Parks,
  ungültige Produkte/Länder und fremde Rücksprungadressen werden abgelehnt.
- Datenbank-Advisors nennen keine der vier neuen Tabellen. Bereits vorhandene
  Hinweise an anderen Tabellen/Views liegen außerhalb dieser Änderung.
- Beide Frontend-Builds und die Übersetzungsprüfung laufen. Vollständige
  Typechecks zeigen bekannte Altfehler: Betreiber 2, Claim-Seiten 87. Ein
  Compilervergleich mit dem jeweiligen unveränderten Stand ergab keine neuen
  Fehler. Edge-Function und Katalogtests werden separat vollständig geprüft.

Bei `needs_attention` keinen Druckauftrag blind neu erstellen. Zuerst anhand
`LP-<Bestell-ID>` in der Sandbox prüfen, ob bereits ein Auftrag existiert.
Unklarer Übertragungsstatus bleibt gesperrt; erst nach Abgleich reparieren.
Bestellfehler enthalten einen technischen Schrittschlüssel, keine API-Secrets.
Provider-Validierungslogs enthalten Feldnamen, keine Adresswerte oder Bild-URLs.

Secrets existieren nur serverseitig: `PRODIGI_CATALOG_API_KEY`,
`PRODIGI_SANDBOX_API_KEY`, `PHOTO_PRODUCTS_STRIPE_WEBHOOK_SECRET`, vorhandener
`SHOP_STRIPE_SECRET_KEY`. Keine Schlüssel in Repository, Kalkulation oder
Browser-Bundle schreiben.

Offizielle Grundlagen: https://www.prodigi.com/print-api/docs/v4/,
https://www.prodigi.com/products/technology/phone-cases/tough-phone-case/,
https://stripe.com/de/pricing.
