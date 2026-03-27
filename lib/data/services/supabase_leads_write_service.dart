import 'package:supabase_flutter/supabase_flutter.dart';

/// Direct Supabase `public.leads` writes — single place for RLS-safe inserts.
///
/// RLS typically requires `user_id = auth.uid()` on insert.
class SupabaseLeadsWriteService {
  SupabaseLeadsWriteService._();

  /// CRM stage stored in `priority` while `status` holds hot/warm/cold.
  static String _dashboardStatusToPriority(String status) {
    final s = status.trim().toLowerCase();
    return s.isEmpty ? 'new' : s;
  }

  /// MVP / LeadFlow dashboard dialog: name, message, source + `status: PENDING`.
  /// Optional [extra] merges app-specific columns (e.g. `intent`, `auto_replied`)
  /// after the required RLS fields.
  static Future<void> insertLeadMvp({
    required String name,
    required String message,
    required String source,
    String? email,
    String? phone,
    Map<String, dynamic>? extra,
  }) async {
    final supabase = Supabase.instance.client;
    final user = supabase.auth.currentUser;

    if (user == null) {
      throw Exception('User not logged in');
    }

    // ignore: avoid_print
    print('INSERT USER ID: ${user.id}');
    // ignore: avoid_print
    print('DEBUG USER: ${user.id}');
    // ignore: avoid_print
    print('INSERT DATA: $name, $message, $source');

    final trimmedEmail = email?.trim() ?? '';
    final trimmedPhone = phone?.trim() ?? '';
    final row = <String, dynamic>{
      'name': name,
      'message': message,
      'source': source,
      'status': 'warm',
      'priority': 'new',
      'score': 50,
      'user_id': user.id,
      'assigned_to': user.id,
      if (trimmedEmail.isNotEmpty) 'email': trimmedEmail,
      if (trimmedPhone.isNotEmpty) 'phone': trimmedPhone,
      ...?extra,
    };

    try {
      await supabase.from('leads').insert(row);
    } catch (e) {
      // ignore: avoid_print
      print('SUPABASE ERROR: $e');
      rethrow;
    }
  }

  /// Legacy dashboard screen (phone + status + auto_reply).
  static Future<void> insertLeadDashboard({
    required String name,
    required String phone,
    String? email,
    required String status,
    required bool autoReply,
  }) async {
    final supabase = Supabase.instance.client;
    final user = supabase.auth.currentUser;

    if (user == null) {
      throw Exception('User not logged in');
    }

    // ignore: avoid_print
    print('INSERT USER ID: ${user.id}');
    // ignore: avoid_print
    print('DEBUG USER: ${user.id}');
    // ignore: avoid_print
    print('INSERT DATA: $name, $phone, $status');

    final trimmedEmail = email?.trim() ?? '';
    try {
      await supabase.from('leads').insert({
        'user_id': user.id,
        'assigned_to': user.id,
        'name': name,
        'phone': phone,
        if (trimmedEmail.isNotEmpty) 'email': trimmedEmail,
        'status': 'warm',
        'priority': _dashboardStatusToPriority(status),
        'score': 50,
        'auto_reply': autoReply,
      });
    } catch (e) {
      // ignore: avoid_print
      print('SUPABASE ERROR: $e');
      rethrow;
    }
  }
}
