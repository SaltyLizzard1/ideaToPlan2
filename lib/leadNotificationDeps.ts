// The real dependencies for recordAndNotifyLead: Supabase for the record, the n8n alert webhook for the email.
// Kept apart from the logic so the logic can be tested on its own.
import { supabase } from './supabase';
import type { LeadDeps } from './leadNotification';

export const leadDeps: LeadDeps = {
  async insertLead(lead) {
    const { data, error } = await supabase.from('lead_notifications').insert(lead).select('id').single();
    // 23505 is the unique index refusing a lead that is already recorded. That is the normal retry case.
    if (error) return error.code === '23505' ? { inserted: false } : { inserted: false, error: error.message };
    return { inserted: true, id: data.id as string };
  },

  async sendNotification(subject, body) {
    const url = process.env.N8N_ALERT_WEBHOOK_URL;
    if (!url) throw new Error('N8N_ALERT_WEBHOOK_URL is not set');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const secret = process.env.N8N_WEBHOOK_SECRET;
    if (secret) headers['X-Webhook-Secret'] = secret;
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ subject, body }), signal: AbortSignal.timeout(5_000) });
    if (!res.ok) throw new Error(`alert webhook answered ${res.status}`);
  },

  async lookupTopMatch(resultId) {
    const { data, error } = await supabase.from('quiz_results').select('matches').eq('id', resultId).eq('site', 'i2p').single();
    if (error || !data || !Array.isArray(data.matches)) return null;
    const top = data.matches[0] as { title?: unknown } | undefined;
    return top && typeof top.title === 'string' ? top.title : null;
  },

  async markNotified(id, status, error) {
    const { error: updateError } = await supabase
      .from('lead_notifications')
      .update({ notify_status: status, notify_error: error ?? null, notified_at: status === 'sent' ? new Date().toISOString() : null })
      .eq('id', id);
    if (updateError) throw new Error(updateError.message);
  },
};
