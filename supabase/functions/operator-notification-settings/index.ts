import { handleOptions, json, supabaseService } from '../_shared/sameProjectAdminAuth.ts';
import { requireOperatorForPark } from '../_shared/operatorAuth.ts';

const DEFAULT_SETTINGS = {
  push_enabled: false,
  photo_inactivity_enabled: true,
  photo_inactivity_minutes: 30,
  paper_low_enabled: true,
  paper_low_threshold: 20,
  support_enabled: true,
  system_health_enabled: true,
};

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const url = new URL(req.url);
  const payload = req.method === 'GET' ? null : await req.json().catch(() => null);
  const parkId =
    typeof payload?.park_id === 'string'
      ? payload.park_id
      : url.searchParams.get('park_id');

  if (!parkId) return json({ error: 'park_id is required' }, 400);

  const auth = await requireOperatorForPark(req, parkId);
  if (!auth.ok) return json({ error: auth.message }, auth.status);

  if (req.method === 'GET') {
    const { data, error } = await supabaseService
      .from('operator_notification_preferences')
      .select(
        'push_enabled, photo_inactivity_enabled, photo_inactivity_minutes, paper_low_enabled, paper_low_threshold, support_enabled, system_health_enabled',
      )
      .eq('operator_user_id', auth.userId)
      .eq('park_id', auth.parkId)
      .maybeSingle();

    if (error) return json({ error: error.message }, 500);
    return json({ settings: data ?? DEFAULT_SETTINGS });
  }

  if (req.method === 'POST') {
    const nextSettings = {
      push_enabled: Boolean(payload?.push_enabled),
      photo_inactivity_enabled:
        typeof payload?.photo_inactivity_enabled === 'boolean'
          ? payload.photo_inactivity_enabled
          : DEFAULT_SETTINGS.photo_inactivity_enabled,
      photo_inactivity_minutes: clampInteger(
        payload?.photo_inactivity_minutes,
        DEFAULT_SETTINGS.photo_inactivity_minutes,
        5,
        240,
      ),
      paper_low_enabled:
        typeof payload?.paper_low_enabled === 'boolean'
          ? payload.paper_low_enabled
          : DEFAULT_SETTINGS.paper_low_enabled,
      paper_low_threshold: clampInteger(
        payload?.paper_low_threshold,
        DEFAULT_SETTINGS.paper_low_threshold,
        1,
        500,
      ),
      support_enabled:
        typeof payload?.support_enabled === 'boolean'
          ? payload.support_enabled
          : DEFAULT_SETTINGS.support_enabled,
      system_health_enabled:
        typeof payload?.system_health_enabled === 'boolean'
          ? payload.system_health_enabled
          : DEFAULT_SETTINGS.system_health_enabled,
    };

    const { error } = await supabaseService.from('operator_notification_preferences').upsert(
      {
        operator_user_id: auth.userId,
        organization_id: auth.organizationId,
        park_id: auth.parkId,
        ...nextSettings,
      },
      { onConflict: 'operator_user_id,park_id' },
    );

    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, settings: nextSettings });
  }

  return json({ error: 'Method not allowed' }, 405);
});
