import 'package:supabase_flutter/supabase_flutter.dart';

/// Supabase `public.leads` — scoped by [assigned_to] for the signed-in user.
class LeadService {
  LeadService._();

  static SupabaseClient get _c => Supabase.instance.client;

  static String? get _uid => _c.auth.currentUser?.id;

  /// Legacy rows created with [user_id] but null [assigned_to] → current user.
  static Future<void> claimUnassignedLeadsForCurrentUser() async {
    final uid = _c.auth.currentUser?.id;
    if (uid == null) return;
    try {
      await _c
          .from('leads')
          .update(<String, dynamic>{'assigned_to': uid})
          .eq('user_id', uid)
          .isFilter('assigned_to', null);
    } catch (e) {
      // ignore: avoid_print
      print('claimUnassignedLeadsForCurrentUser: $e');
    }
  }

  /// One-shot fetch (no realtime). Only leads assigned to the current user.
  static Future<List<Map<String, dynamic>>> fetchLeadsOnce() async {
    final uid = _uid;
    if (uid == null) return [];
    await claimUnassignedLeadsForCurrentUser();
    final response = await _c
        .from('leads')
        .select()
        .eq('assigned_to', uid)
        .order('created_at', ascending: true);
    return List<Map<String, dynamic>>.from(
      (response as List<dynamic>).map(
        (e) => Map<String, dynamic>.from(e as Map),
      ),
    );
  }

  static Future<void> insertLead({
    required String name,
    required String email,
    required String phone,
  }) async {
    final user = _c.auth.currentUser;
    if (user == null) {
      throw Exception('Not signed in');
    }
    await _c.from('leads').insert(<String, dynamic>{
      'name': name,
      'email': email,
      'phone': phone,
      'status': 'warm',
      'priority': 'new',
      'stage': 'new',
      'score': 50,
      'last_contacted': null,
      'next_followup': null,
      'user_id': user.id,
      'assigned_to': user.id,
    });
  }

  /// Recomputes [score] and temperature [status] (hot / warm / cold) from [last_contacted].
  static Future<void> updateLeadScore(Map<String, dynamic> lead) async {
    final uid = _c.auth.currentUser?.id;
    if (uid == null) {
      throw Exception('Not signed in');
    }
    final id = lead['id']?.toString();
    if (id == null || id.isEmpty) {
      throw Exception('Missing lead id');
    }

    var score = (lead['score'] as num?)?.toInt() ?? 50;
    final lastRaw = lead['last_contacted']?.toString();
    DateTime? lastContacted;
    if (lastRaw != null && lastRaw.trim().isNotEmpty) {
      lastContacted = DateTime.tryParse(lastRaw.trim());
    }

    if (lastContacted != null) {
      final diff = DateTime.now().difference(lastContacted);
      if (diff.inHours < 24) {
        score += 10;
      } else if (diff.inDays >= 3) {
        score -= 10;
      }
    }
    score = score.clamp(0, 100);

    final String status;
    if (score >= 70) {
      status = 'hot';
    } else if (score >= 40) {
      status = 'warm';
    } else {
      status = 'cold';
    }

    await _c.from('leads').update(<String, dynamic>{
      'score': score,
      'status': status,
    }).eq('id', id).eq('assigned_to', uid);
  }

  static Future<void> updateLeadStatus({
    required String leadId,
    required String status,
  }) async {
    final uid = _c.auth.currentUser?.id;
    if (uid == null) {
      throw Exception('Not signed in');
    }
    await _c
        .from('leads')
        .update(<String, dynamic>{'status': status})
        .eq('id', leadId)
        .eq('assigned_to', uid);
  }

  static Future<void> updateAssignedTo({
    required String leadId,
    required String assigneeUserId,
  }) async {
    final uid = _c.auth.currentUser?.id;
    if (uid == null) {
      throw Exception('Not signed in');
    }
    await _c
        .from('leads')
        .update(<String, dynamic>{'assigned_to': assigneeUserId})
        .eq('id', leadId)
        .eq('assigned_to', uid);
  }
}
