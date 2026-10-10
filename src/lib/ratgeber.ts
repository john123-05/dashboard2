// Ratgeber-Artikel (docs/PRODUKT_PLAN.md, G3). Texte von Tom Nolting (LinkedIn), unverändert übernommen;
// die Artikel bleiben in der Sprache, in der sie geschrieben wurden. Später soll ein Editor im
// Liftpictures-CRM (Aufgabe G2, Tabelle `articles`) diese Liste ersetzen.

import { useEffect, useState } from 'react';
import { usePark } from '../contexts/ParkContext';
import { EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY } from './supabase';
import { getFunctionSession } from './functionAuth';

export type RatgeberArticle = {
  slug: string;
  title: string;
  /** Sprache des Artikeltextes. */
  lang: 'de' | 'en';
  /** ISO-Datum der Veröffentlichung. */
  date: string;
  excerpt: string;
  /** Titelbild (liegt unter public/ratgeber). */
  image: string;
  imageAlt: string;
  /** Absätze durch Leerzeilen getrennt; Adressen werden zu Links. */
  body: string;
};

export const TOM_LINKEDIN_URL = 'https://www.linkedin.com/in/tom-nolting-1278703a2/';

export const RATGEBER_ARTICLES: RatgeberArticle[] = [
  {
    slug: "bildqualitaet",
    title: "Bildqualität",
    lang: "de",
    date: "2026-08-13",
    excerpt: "Macht Bildqualität aus geschäftlicher Sicht wirklich einen Unterschied? Ein Kunde verdreifachte nach einem Kamera-Upgrade seinen Umsatz.",
    image: "/ratgeber/bildqualitaet.jpg",
    imageAlt: "Wie wichtig ist Bildqualität?",
    body: "Hi,\n\nBildqualität ist wichtig.\n\nDas weiß jeder.\n\nAber macht sie aus geschäftlicher Sicht wirklich einen Unterschied?\n\nNatürlich möchte jeder schöne Bilder haben. Das verstehen wir. Aber wenn die Bilder ,,gut aussehen'', reicht das nicht aus?\n\nKlar, man kann die Qualität immer weiter verbessern. Aber bringt das wirklich was?\n\nDie kurze Antwort:\n\nJa, definitiv. Die Bildqualität kann einen enormen Unterschied beim Umsatz machen.\n\nWenn die Farben nicht kräftig genug sind, die Gesichter nicht hell genug wirken oder der Himmel nicht blau genug ist, läuft ein potenzieller Käufer einfach vorbei.\n\nDenn heute konkurriert man mit Smartphones, Instagram und KI.\n\nÜberall sehen Menschen perfekte Bilder. Und genau deshalb muss auch ein Onride-Foto richtig gut aussehen, damit es für einen Besucher interessant ist.\n\nTut es das nicht, bleibt es vielleicht eine lustige Erinnerung an die Fahrt – aber nicht unbedingt etwas, das man teilen möchte. Und vor allem nichts, wofür man Geld ausgeben möchte.\n\nDeshalb ist es wichtig, dass die Bilder herausstechen.\n\nEiner unserer Kunden hat vor Kurzem ein Kamera-Upgrade auf unsere neueste Version bekommen. Die Bilder sehen seitdem sichtbar besser aus.\n\nNach einem Monat rief er uns an und sagte:\n\n„Meine Buchhaltung sagt, wir haben den Umsatz verdreifacht. Was ist passiert?“\n\nDie Antwort:\n\nEr hatte bessere Bilder, und diese Bilder haben deutlich mehr potenzielle Käufer angesprochen.\n\nAlso ja: Bildqualität ist extrem wichtig.\n\nAber sie ist nur einer von vielen Faktoren.\n\nWenn Sie ein Fotosystem an Ihrer Attraktion installieren möchten und einen Partner suchen, der sich darum kümmert, melden Sie sich gerne bei uns.\n\nWir bauen seit 20 Jahren Fotosysteme und wissen genau, an welchen Stellschrauben man drehen muss, um das Maximum an Umsatz aus einem Fotosystem herauszuholen.\n\nViele Grüße,\n\nTom",
  },
  {
    slug: "sell-more-rides",
    title: "How to sell more rides and reach your visitors.",
    lang: "en",
    date: "2026-05-29",
    excerpt: "Do people still buy printed photos? Why a printed ride photo is more valuable than ever – and free marketing for your attraction.",
    image: "/ratgeber/sell-more-rides.jpg",
    imageAlt: "Sell more rides – here is how",
    body: "Hi,\n\nwe were at an event recently when a friend asked me:\n\n“Do people even buy printed photos these days?”\n\nIn the age of smartphones, it’s a reasonable question.\n\nBut here’s the catch:\n\nMost photos never leave the screen.\n\nThey sit in a gallery with thousands of others. No matter how special the moment was, eventually it gets forgotten.\n\nWhich is exactly why printed photos have become more valuable than ever.\n\nA few decades ago, the photos in your kitchen had to compete with weddings, birthdays, or the first day of school.\n\nToday, that competition is gone.\n\nThe memories still exist, but they live inside phones.\n\nAs a result, almost any printed photo stands out.\n\nPeople appreciate it because it’s physical, rare, and real.\n\nWe’ve even seen guests take photos of their printed ride photos and share them online.\n\nTo show, ''look what we've found'', no ai filter, something authentic and rare.\n\nThey stand out in a digital world.\n\nAnd every time that happens, it is your attraction that is being shown.\n\nAnd the best part:\n\nPeople don’t just see a photo.\n\nThey see friends having fun, couples making memories, and experiences they want for themselves.\n\nWhich is the most powerful marketing you can use for your attraction. So yes, people buy printed photos these days, more than ever.\n\nIf you want to install an onride camera and want to learn more: get your free pdf material for your attraction here:👇\n\nhttps://liftpictures-contact.com/",
  },
  {
    slug: "fotosystem-sinn",
    title: "Wann macht ein Fotosystem an einer Attraktion Sinn?",
    lang: "de",
    date: "2026-05-20",
    excerpt: "Warum eine Fotoanlage nie die einzige Einnahmequelle sein sollte – und wann sie sich für eine Attraktion wirklich lohnt.",
    image: "/ratgeber/fotosystem-sinn.jpg",
    imageAlt: "Ist es das wert?",
    body: "Hallo,\n\nneulich waren wir zu Besuch bei einer Zip-Line, welche noch keine Fotoanlage hatte.\n\nDer perfekte Kunde.\n\nEigentlich.\n\nAlso haben wir die Attraktion genauer besichtigt. Es war ein schöner Sommertag an einem Wochenende (perfekt um Test- Bilder aufzunehmen), und haben uns angeschaut, wo wir am besten ein Fotosystem integrieren könnten.\n\nDann stellten wir die Frage, wann der Betrieb den eröffnet werden sollte.\n\nDie kurze Antwort, er war es schon.\n\nUnd das war der Punkt, an dem wir gesehen haben, dass die Zusammenarbeit wahrscheinlich keinen Sinn macht.\n\nNicht weil es technisch nicht umsetzbar wäre, nicht weil wir die perfekten Bilder automatisch für Kunden und Gäste erzielen würden. Sondern weil die Gäste nicht da waren.\n\nNun sehr pragmatisch gesagt, fragten wir natürlich nach dem Besucher Volumen.\n\nSehr gering, zu gering um zu sagen, es wäre ein lebender Betrieb.\n\nUnd das ist genau der springende Punkt, eine Fotoanlage ist nicht dazu da, die einzigste Einnahmequelle zu sein. Wenn die Attraktion an sich kaum Umsatz abwirft, wird dies eine Fotoanlage nicht ausgleichen. Eigentlich ein simpler Gedankengang, den aber viele in der Branche nicht verstehen. Kein revenue share, kein leasing oder ähnliches ändert diese Situation.\n\nDoch betrachtet man es von einer anderen Seite, und die Attraktion läuft, ist es ein super Nebenverdienst. Ungefähr jeder dritte Besucher kauft ein Bild, zum Preis einer Fahrt. Eine Fotoanlage kostet jedoch nur ein Bruchteil einer Attraktion im Vorfeld, also ein ,,no brainer'' für jeden Geschäftsmann. Und damit auch für uns der perfekte Kunde.\n\nNicht weil wir um jeden Preis unsere Technologie verkaufen wollen. Sondern einen Partner schließen wollen, der sein Geschäft versteht, und über viele Jahre glücklich zusätzlichen Umsatz mit einer Fotoanlage machen will.\n\nTom\n\nP.S. Wenn Sie unsicher sind, ob sich unser System für Ihre Attraktion wirtschaftlich lohnt, haben wir auf unserer Website einen Umsatzrechner erstellt. Testen Sie ihn gerne aus:",
  },
];

export function articleBySlug(slug: string | undefined, list: RatgeberArticle[] = RATGEBER_ARTICLES): RatgeberArticle | undefined {
  return list.find((article) => article.slug === slug);
}

type ArticleRow = {
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  lang: string;
  cover_url: string | null;
  cover_alt: string;
  published_at: string | null;
};

/**
 * Artikel aus der Tabelle `articles` (im Liftpictures-CRM gepflegt). Solange die Abfrage nichts liefert
 * (oder fehlschlägt), zeigt die Seite die fest eingebauten Artikel oben.
 */
export function useArticles(): { articles: RatgeberArticle[]; loading: boolean } {
  const { parkId } = usePark();
  const [state, setState] = useState<{ articles: RatgeberArticle[]; loading: boolean }>({ articles: RATGEBER_ARTICLES, loading: true });
  useEffect(() => {
    let active = true;
    if (!parkId) return;
    (async () => {
      try {
        const {
          data: { session },
        } = await getFunctionSession();
        if (!session?.access_token) throw new Error('no session');
        const res = await fetch(`${EXTERNAL_SUPABASE_URL}/functions/v1/operator-articles?park_id=${encodeURIComponent(parkId)}`, {
          headers: { Authorization: `Bearer ${session.access_token}`, apikey: EXTERNAL_SUPABASE_ANON_KEY },
        });
        const body = await res.json().catch(() => null);
        const rows = (body?.data?.articles ?? []) as ArticleRow[];
        if (!active) return;
        if (res.ok && rows.length > 0) {
          setState({
            loading: false,
            articles: rows.map((row) => ({
              slug: row.slug,
              title: row.title,
              lang: row.lang as 'de' | 'en',
              date: (row.published_at ?? '').slice(0, 10) || '2026-01-01',
              excerpt: row.excerpt,
              image: row.cover_url ?? '',
              imageAlt: row.cover_alt,
              body: row.body,
            })),
          });
          return;
        }
      } catch {
        // Rückfall auf die fest eingebauten Artikel
      }
      if (active) setState({ articles: RATGEBER_ARTICLES, loading: false });
    })();
    return () => {
      active = false;
    };
  }, [parkId]);
  return state;
}
