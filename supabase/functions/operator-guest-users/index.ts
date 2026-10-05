import { handleOptions, json, supabaseService } from '../_shared/sameProjectAdminAuth.ts';
import { requireOperatorForPark } from '../_shared/operatorAuth.ts';

/**
 * operator-guest-users
 *
 * Fuer die Benutzer-Seite im Betreiber-Dashboard:
 *  - GET  ?park_id=...  -> registrierte Gaeste (Profil mit Namen = "hat sich in die
 *    Tagesbestenliste eingetragen") und die Live-Bestenliste von heute.
 *  - POST {park_id, email, action} -> Gast entfernen:
 *      delete_profile: loescht das Profil (Name, Profilbild, Bestenlisten-Eintrag).
 *                      Freischaltungen und Fotos bleiben unberuehrt.
 *      delete_user:    wie delete_profile, zusaetzlich werden Name, E-Mail, Telefon
 *                      und Adresse in den Freischaltungen dieses Gastes geleert und
 *                      das Marketing-Opt-in entzogen (anonymisiert statt geloescht,
 *                      damit Zaehler und Fotos stimmen bleiben).
 *  - POST multipart/form-data {park_id, email, action: 'set_avatar', image} ->
 *      Staff/Betreiber setzt das Profilbild eines bereits eingetragenen Gastes.
 *  - POST {park_id, email, action: 'delete_avatar'} -> nur das Profilbild
 *      entfernen, Name/Bestenlisten-Eintrag bleiben.
 *
 * Alle Aktionen wirken nur auf bereits vorhandene park_guest_profiles-Zeilen
 * (also Gaeste, die sich tatsaechlich fuer die Tagesbestenliste eingetragen
 * haben) - fuer alle anderen gibt es hier nichts zu verwalten.
 *
 * Laeuft mit verify_jwt = false; der Operator-Token stammt aus dem anderen
 * Projekt und wird in requireOperatorForPark selbst geprueft.
 */

const AVATAR_BUCKET = 'avatars';
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

function businessDate(timeZone: string, iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function avatarObjectPath(url: string | null): string | null {
  if (!url) return null;
  const match = /\/avatars\/([^?]+)/.exec(url);
  return match ? decodeURIComponent(match[1]) : null;
}

async function loadOverview(parkId: string) {
  const { data: park } = await supabaseService.from('parks').select('timezone').eq('id', parkId).maybeSingle();
  const timezone = park?.timezone || 'Europe/Berlin';

  // Registrierte Gaeste: Profil mit Namen.
  const { data: profiles, error: profilesError } = await supabaseService
    .from('park_guest_profiles')
    .select('email, display_name, avatar_url, leaderboard_opt_out, created_at, updated_at')
    .eq('park_id', parkId)
    .not('display_name', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(500);
  if (profilesError) throw new Error(profilesError.message);
  const named = (profiles ?? []).filter((p) => String(p.display_name ?? '').trim() !== '');

  // Freischaltungen + beste Geschwindigkeit je Gast.
  const emails = named.map((p) => String(p.email).toLowerCase());
  const stats = new Map<string, { claimCount: number; bestSpeedKmh: number | null; lastClaimAt: string | null }>();
  if (emails.length > 0) {
    const { data: claims } = await supabaseService
      .from('photo_claims')
      .select('email, photo_id, claimed_at, created_at')
      .eq('park_id', parkId)
      .eq('status', 'claimed')
      .in('email', emails);
    const photoIds = [...new Set((claims ?? []).map((c) => c.photo_id as string))];
    const speedByPhoto = new Map<string, number | null>();
    if (photoIds.length > 0) {
      const { data: photos } = await supabaseService.from('photos').select('id, speed_kmh').in('id', photoIds);
      for (const p of photos ?? []) speedByPhoto.set(p.id as string, p.speed_kmh as number | null);
    }
    for (const c of claims ?? []) {
      const email = String(c.email).toLowerCase();
      const entry = stats.get(email) ?? { claimCount: 0, bestSpeedKmh: null, lastClaimAt: null };
      entry.claimCount += 1;
      const speed = speedByPhoto.get(c.photo_id as string);
      if (typeof speed === 'number' && (entry.bestSpeedKmh === null || speed > entry.bestSpeedKmh)) {
        entry.bestSpeedKmh = speed;
      }
      const at = (c.claimed_at ?? c.created_at) as string | null;
      if (at && (!entry.lastClaimAt || at > entry.lastClaimAt)) entry.lastClaimAt = at;
      stats.set(email, entry);
    }
  }

  const users = named.map((p) => {
    const s = stats.get(String(p.email).toLowerCase());
    return {
      email: p.email,
      displayName: p.display_name,
      avatarUrl: p.avatar_url,
      leaderboardOptOut: p.leaderboard_opt_out === true,
      createdAt: p.created_at,
      claimCount: s?.claimCount ?? 0,
      bestSpeedKmh: s?.bestSpeedKmh ?? null,
      lastClaimAt: s?.lastClaimAt ?? null,
    };
  });

  // Live-Bestenliste von heute - dieselbe Logik wie die Gast-Seite:
  // freigeschaltete Fotos von heute mit Geschwindigkeit, ohne Opt-out.
  const today = businessDate(timezone, new Date().toISOString());
  const since = new Date(new Date(`${today}T00:00:00`).getTime() - 12 * 3600_000).toISOString();
  const { data: todaysPhotos } = await supabaseService
    .from('photos')
    .select('id, speed_kmh, captured_at')
    .eq('park_id', parkId)
    .eq('is_test', false)
    .not('speed_kmh', 'is', null)
    .gte('captured_at', since);
  const sameDay = (todaysPhotos ?? []).filter((p) => businessDate(timezone, p.captured_at as string) === today);

  let rows: Array<{
    rank: number;
    speedKmh: number;
    capturedAt: string;
    displayName: string | null;
    avatarUrl: string | null;
  }> = [];
  let totalToday = 0;

  if (sameDay.length > 0) {
    const { data: claimedRows } = await supabaseService
      .from('photo_claims')
      .select('photo_id, email')
      .eq('park_id', parkId)
      .eq('status', 'claimed')
      .in('photo_id', sameDay.map((p) => p.id));
    const emailByPhoto = new Map(
      (claimedRows ?? []).map((c) => [c.photo_id as string, ((c.email as string | null) ?? '').toLowerCase()]),
    );
    const claimedEmails = [...new Set([...emailByPhoto.values()].filter(Boolean))];

    const profileByEmail = new Map<string, { displayName: string | null; avatarUrl: string | null; optOut: boolean }>();
    if (claimedEmails.length > 0) {
      const { data: profileRows } = await supabaseService
        .from('park_guest_profiles')
        .select('email, display_name, avatar_url, leaderboard_opt_out')
        .eq('park_id', parkId)
        .in('email', claimedEmails);
      for (const r of profileRows ?? []) {
        profileByEmail.set(String(r.email).toLowerCase(), {
          displayName: r.display_name,
          avatarUrl: r.avatar_url,
          optOut: r.leaderboard_opt_out === true,
        });
      }
    }

    const eligible = sameDay
      .filter((p) => emailByPhoto.has(p.id as string) && !profileByEmail.get(emailByPhoto.get(p.id as string) ?? '')?.optOut)
      .sort((a, b) => (b.speed_kmh as number) - (a.speed_kmh as number));
    totalToday = eligible.length;
    rows = eligible.slice(0, 50).map((p, i) => {
      const profile = profileByEmail.get(emailByPhoto.get(p.id as string) ?? '');
      return {
        rank: i + 1,
        speedKmh: p.speed_kmh as number,
        capturedAt: p.captured_at as string,
        displayName: profile?.displayName ?? null,
        avatarUrl: profile?.avatarUrl ?? null,
      };
    });
  }

  return { users, leaderboard: { date: today, totalToday, rows } };
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method === 'GET') {
    const parkId = (new URL(req.url).searchParams.get('park_id') || '').trim();
    if (!parkId) return json({ error: 'park_id fehlt' }, 400);
    const auth = await requireOperatorForPark(req, parkId);
    if (!auth.ok) return json({ error: auth.message }, auth.status);
    try {
      return json({ ok: true, data: await loadOverview(auth.parkId) });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Unbekannter Fehler' }, 500);
    }
  }

  if (req.method === 'POST') {
    const contentType = req.headers.get('content-type') || '';
    let parkId = '';
    let email = '';
    let action = '';
    let imageFile: File | null = null;

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData().catch(() => null);
      if (!form) return json({ error: 'Invalid form data' }, 400);
      parkId = String(form.get('park_id') || '').trim();
      email = String(form.get('email') || '').trim().toLowerCase();
      action = String(form.get('action') || '').trim();
      const img = form.get('image');
      if (img instanceof File && img.size > 0) imageFile = img;
    } else {
      const payload = await req.json().catch(() => null);
      parkId = typeof payload?.park_id === 'string' ? payload.park_id.trim() : '';
      email = typeof payload?.email === 'string' ? payload.email.trim().toLowerCase() : '';
      action = typeof payload?.action === 'string' ? payload.action : '';
    }

    const VALID_ACTIONS = ['delete_profile', 'delete_user', 'set_avatar', 'delete_avatar'];
    if (!parkId || !email || !VALID_ACTIONS.includes(action)) {
      return json({ error: 'park_id, email und eine gueltige action sind Pflicht' }, 400);
    }
    const auth = await requireOperatorForPark(req, parkId);
    if (!auth.ok) return json({ error: auth.message }, auth.status);

    const { data: profile } = await supabaseService
      .from('park_guest_profiles')
      .select('email, avatar_url')
      .eq('park_id', auth.parkId)
      .eq('email', email)
      .maybeSingle();
    if (!profile) return json({ error: 'Gast nicht gefunden' }, 404);

    if (action === 'set_avatar') {
      if (!imageFile) return json({ error: 'Bild fehlt' }, 400);
      if (imageFile.size > MAX_AVATAR_BYTES) return json({ error: 'Bild zu groß (max. 5 MB)' }, 400);
      if (!imageFile.type.startsWith('image/')) return json({ error: 'Nur Bilder erlaubt' }, 400);

      const oldPath = avatarObjectPath(profile.avatar_url as string | null);
      const ext = imageFile.name.includes('.') ? imageFile.name.slice(imageFile.name.lastIndexOf('.')) : '.jpg';
      const storagePath = `${auth.parkId}/${encodeURIComponent(email)}-${crypto.randomUUID()}${ext}`;

      const { error: uploadError } = await supabaseService.storage
        .from(AVATAR_BUCKET)
        .upload(storagePath, imageFile, { contentType: imageFile.type || undefined });
      if (uploadError) return json({ error: uploadError.message }, 400);

      const { data: pub } = supabaseService.storage.from(AVATAR_BUCKET).getPublicUrl(storagePath);

      const { error: updateError } = await supabaseService
        .from('park_guest_profiles')
        .update({ avatar_url: pub.publicUrl })
        .eq('park_id', auth.parkId)
        .eq('email', email);
      if (updateError) {
        await supabaseService.storage.from(AVATAR_BUCKET).remove([storagePath]);
        return json({ error: updateError.message }, 500);
      }

      if (oldPath) await supabaseService.storage.from(AVATAR_BUCKET).remove([oldPath]);

      return json({ ok: true, data: { avatarUrl: pub.publicUrl } });
    }

    if (action === 'delete_avatar') {
      const avatarPath = avatarObjectPath(profile.avatar_url as string | null);
      if (avatarPath) await supabaseService.storage.from(AVATAR_BUCKET).remove([avatarPath]);

      const { error: updateError } = await supabaseService
        .from('park_guest_profiles')
        .update({ avatar_url: null })
        .eq('park_id', auth.parkId)
        .eq('email', email);
      if (updateError) return json({ error: updateError.message }, 500);

      return json({ ok: true });
    }

    // delete_profile / delete_user
    const avatarPath = avatarObjectPath(profile.avatar_url as string | null);
    if (avatarPath) {
      await supabaseService.storage.from(AVATAR_BUCKET).remove([avatarPath]);
    }

    const { error: deleteError } = await supabaseService
      .from('park_guest_profiles')
      .delete()
      .eq('park_id', auth.parkId)
      .eq('email', email);
    if (deleteError) return json({ error: deleteError.message }, 500);

    let anonymizedClaims = 0;
    if (action === 'delete_user') {
      const { data: updated, error: claimsError } = await supabaseService
        .from('photo_claims')
        .update({ full_name: '', email: '', phone: null, address: null, marketing_opt_in: false })
        .eq('park_id', auth.parkId)
        .eq('email', email)
        .select('id');
      if (claimsError) return json({ error: claimsError.message }, 500);
      anonymizedClaims = updated?.length ?? 0;
    }

    return json({ ok: true, data: { action, anonymizedClaims } });
  }

  return json({ error: 'Method not allowed' }, 405);
});
