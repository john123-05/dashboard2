import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * park-lookup – öffentlich (vor der Anmeldung), Operator-Projekt. Ersetzt die Park-Liste auf der Login-Seite:
 * Statt alle Kunden in einem Aufklappmenü zu zeigen, tippt man die ersten Buchstaben seines Parks.
 *
 *   GET ?q=<Anfang des Parknamens>  ->  { park: { id, name } | null, state: 'short' | 'none' | 'many' | 'one' }
 *
 * Es kommt NIE mehr als ein Park zurück:
 * - weniger als 2 Zeichen           -> 'short'
 * - genau ein Park passt             -> 'one' (der Park)
 * - der getippte Text ist exakt ein Parkname (auch wenn andere damit anfangen, z. B. „Demo Park“ / „Demo Park 1“) -> 'one'
 * - mehrere passen                   -> 'many' (ohne Namen, ohne Anzahl) – weiter tippen
 * Verglichen wird ohne Groß/Klein und ohne Akzente (ü = u, é = e); es zählt der Anfang des Namens
 * oder der Anfang eines Wortes im Namen.
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const APP_SUPABASE_URL = Deno.env.get("APP_SUPABASE_URL");
const APP_SUPABASE_SERVICE_KEY = Deno.env.get("APP_SUPABASE_SERVICE_KEY");

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
  if (!APP_SUPABASE_URL || !APP_SUPABASE_SERVICE_KEY) return json({ error: "Not configured" }, 500);

  const q = normalize((new URL(req.url).searchParams.get("q") ?? "").slice(0, 80));
  if (q.length < 2) return json({ park: null, state: "short" });

  const res = await fetch(`${APP_SUPABASE_URL}/rest/v1/parks?select=id,name&is_active=eq.true&order=name.asc`, {
    headers: { apikey: APP_SUPABASE_SERVICE_KEY, Authorization: `Bearer ${APP_SUPABASE_SERVICE_KEY}` },
  });
  if (!res.ok) return json({ error: "Lookup unavailable" }, 503);
  const parks = (await res.json()) as { id: string; name: string }[];

  const entries = parks.map((park) => ({ park, name: normalize(park.name) }));
  const exact = entries.filter((e) => e.name === q);
  if (exact.length === 1) return json({ park: exact[0].park, state: "one" });

  const matches = entries.filter((e) => e.name.startsWith(q) || e.name.split(" ").some((word) => word.startsWith(q)));
  if (matches.length === 1) return json({ park: matches[0].park, state: "one" });
  return json({ park: null, state: matches.length === 0 ? "none" : "many" });
});
