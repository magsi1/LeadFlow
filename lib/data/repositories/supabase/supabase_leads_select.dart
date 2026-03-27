/// Explicit column list for `public.leads` reads.
///
/// Ensures `email` is always requested (PostgREST / schema cache safe).
///
/// **Note:** The DB uses `source_channel`, not `source`. A minimal read like
/// `id, name, phone, email, source_channel, status, created_at` would omit
/// fields required by [SupabaseLeadRepository._mapLead] — use [columns].
class SupabaseLeadsSelect {
  SupabaseLeadsSelect._();

  /// All columns used by [SupabaseLeadRepository._mapLead] / analytics mappers.
  /// Includes **`email`** plus `priority`, `user_id`, `workspace_id`, etc.
  static const String columns = 'id, user_id, workspace_id, name, phone, email, city, '
      'source_channel, status, assigned_to, notes, created_at, updated_at, '
      'next_follow_up_at, next_followup, conversation_id, priority, created_by, score, '
      'score_category, deal_value, deal_status, last_contacted';
}
