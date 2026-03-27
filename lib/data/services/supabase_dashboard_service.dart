import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/dashboard_lead.dart';

class SupabaseDashboardService {
  SupabaseDashboardService._();

  static SupabaseClient get _c => Supabase.instance.client;

  static String? get _uid => _c.auth.currentUser?.id;

  static const _pipeline = {'new', 'contacted', 'follow_up', 'closed'};

  static Future<List<DashboardLead>> fetchDashboardLeads() async {
    final uid = _uid;
    if (uid == null) return <DashboardLead>[];

    await _c
        .from('leads')
        .update(<String, dynamic>{'assigned_to': uid})
        .eq('user_id', uid)
        .isFilter('assigned_to', null);

    final response = await _c
        .from('leads')
        .select(
          'id,name,phone,status,stage,created_at,follow_up_time,follow_up_sent',
        )
        .eq('assigned_to', uid)
        .order('created_at', ascending: false)
        .limit(100);

    return List<Map<String, dynamic>>.from(
      (response as List<dynamic>).map(
        (e) => Map<String, dynamic>.from(e as Map),
      ),
    ).map(DashboardLead.fromRow).toList();
  }

  static Future<void> updateLeadStatus({
    required String leadId,
    required String status,
  }) async {
    final uid = _uid;
    if (uid == null) throw Exception('Not signed in');

    final patch = <String, dynamic>{'status': status};
    if (_pipeline.contains(status)) {
      patch['stage'] = status;
    }
    if (status == 'follow_up') {
      patch['follow_up_time'] =
          DateTime.now().add(const Duration(minutes: 30)).toIso8601String();
      patch['follow_up_sent'] = false;
    }

    await _c
        .from('leads')
        .update(patch)
        .eq('id', leadId)
        .eq('assigned_to', uid);
  }

  /// Marks automated follow-up as sent (after [sendAutoWhatsApp] succeeds).
  static Future<void> markFollowUpSent(String leadId) async {
    final uid = _uid;
    if (uid == null) throw Exception('Not signed in');
    await _c.from('leads').update(<String, dynamic>{
      'follow_up_sent': true,
    }).eq('id', leadId).eq('assigned_to', uid);
  }
}
