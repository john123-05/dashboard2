import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json, verifyStaffAdmin } from "../_shared/staffAuth.ts";

// This project's own credentials (native to xcrxltiiovpoladpaewd) — used to
// actually write the file + row, since media_assets/media-library live here.
const OWN_SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const OWN_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

function asciiSafe(input: string): string {
  const umlauts: Record<string, string> = {
    ä: "ae", ö: "oe", ü: "ue", ß: "ss", Ä: "Ae", Ö: "Oe", Ü: "Ue",
  };
  let out = input.replace(/[äöüßÄÖÜ]/g, (ch) => umlauts[ch] ?? ch);
  out = out.replace(/[^a-zA-Z0-9 ._-]/g, "");
  return out.trim() || "file";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  if (!OWN_SUPABASE_URL || !OWN_SERVICE_ROLE_KEY) {
    return json({ error: "Storage credentials not configured" }, 500);
  }

  try {
    const form = await req.formData();
    const staffAccessToken = form.get("staffAccessToken");
    const file = form.get("file");
    const title = form.get("title");
    const category = form.get("category");
    const subcategory = form.get("subcategory");
    const keywordsRaw = form.get("keywords");

    if (typeof staffAccessToken !== "string" || !staffAccessToken) {
      return json({ error: "Fehlende Staff-Sitzung" }, 401);
    }
    if (!(file instanceof File)) {
      return json({ error: "Keine Datei übermittelt" }, 400);
    }
    if (typeof title !== "string" || !title.trim()) {
      return json({ error: "Titel fehlt" }, 400);
    }
    if (typeof category !== "string" || !category.trim()) {
      return json({ error: "Kategorie fehlt" }, 400);
    }

    const auth = await verifyStaffAdmin(staffAccessToken);
    if (!auth.ok) {
      return json({ error: auth.message }, auth.status);
    }

    const safeCategory = asciiSafe(category.trim());
    const safeSubcategory = asciiSafe(typeof subcategory === "string" && subcategory.trim() ? subcategory.trim() : "allgemein");
    const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
    const safeStem = asciiSafe(title.trim());
    const uniqueSuffix = Date.now().toString(36);
    const filename = `${safeStem}-${uniqueSuffix}${ext.toLowerCase()}`;
    const storagePath = `${safeCategory}/${safeSubcategory}/${filename}`;

    const fileBuffer = await file.arrayBuffer();
    const uploadRes = await fetch(
      `${OWN_SUPABASE_URL}/storage/v1/object/media-library/${storagePath}`,
      {
        method: "POST",
        headers: {
          apikey: OWN_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${OWN_SERVICE_ROLE_KEY}`,
          "Content-Type": file.type || "application/octet-stream",
        },
        body: fileBuffer,
      },
    );

    if (!uploadRes.ok) {
      const details = await uploadRes.text();
      return json({ error: "Upload fehlgeschlagen", details }, 502);
    }

    const mediaType = file.type.startsWith("video/") ? "video" : "image";
    const keywords = typeof keywordsRaw === "string" && keywordsRaw.trim()
      ? keywordsRaw.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean)
      : [];

    const insertRes = await fetch(`${OWN_SUPABASE_URL}/rest/v1/media_assets`, {
      method: "POST",
      headers: {
        apikey: OWN_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${OWN_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        title: title.trim(),
        category: category.trim(),
        subcategory: typeof subcategory === "string" && subcategory.trim() ? subcategory.trim() : null,
        keywords,
        storage_path: storagePath,
        media_type: mediaType,
        file_size_bytes: file.size,
        source_folder: "manueller Upload",
      }),
    });

    if (!insertRes.ok) {
      const details = await insertRes.text();
      return json({ error: "Datenbankeintrag fehlgeschlagen", details }, 502);
    }

    const [row] = await insertRes.json();
    return json({ ok: true, asset: row });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unbekannter Fehler" }, 500);
  }
});
