import { supabase } from './supabase';
import { notify } from './notify';

export async function checkRateLimit(
  key: string,
  max: number,
  windowSeconds: number
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_key: key,
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    if (error) {
      console.error('Rate limit check error:', error);
      notify('rateLimit RPC failure', error.message);
      return true;
    }
    return data === true;
  } catch (err) {
    console.error('Rate limit error:', err);
    notify('rateLimit RPC failure', err instanceof Error ? err.message : String(err));
    return true;
  }
}

export function clientIp(req: Request): string {
  // X-Forwarded-For is a comma-separated chain: client-claimed value first,
  // each trusted proxy's own value appended after. The LAST entry is the one
  // added by our own edge (Vercel) and can't be spoofed by the client, the
  // first entry can be set to anything by whoever sends the request.
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const parts = forwarded.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return req.headers.get('x-real-ip') ?? 'unknown';
}
