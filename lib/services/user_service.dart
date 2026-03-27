import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// `public.users` directory (RLS: row must use [auth.users] id for insert/upsert).
class UserService {
  UserService._();

  static SupabaseClient get _c => Supabase.instance.client;

  /// Upserts the signed-in user into [users] (same id as [auth.users] — satisfies typical RLS).
  ///
  /// Idempotent: [ignoreDuplicates] avoids errors if the row already exists.
  /// Runs after login/signup from [LoginScreen] / [PipelineScreen] without UI changes.
  static Future<void> upsertCurrentUserFromSession() async {
    final user = _c.auth.currentUser;
    if (user == null) {
      throw Exception('Not authenticated');
    }

    try {
      await _c.from('users').upsert(
        <String, dynamic>{
          'id': user.id,
          'email': user.email ?? '',
        },
        onConflict: 'id',
        ignoreDuplicates: true,
      );
    } catch (e, st) {
      debugPrint('UserService.upsertCurrentUserFromSession: $e');
      debugPrint('$st');
      // Do not rethrow: login/navigation should still succeed if directory sync fails.
    }
  }

  /// All directory users (for assignee pickers).
  static Future<List<Map<String, dynamic>>> fetchUsers() async {
    final response = await _c.from('users').select('id, email').order('email');
    return List<Map<String, dynamic>>.from(
      (response as List<dynamic>).map(
        (e) => Map<String, dynamic>.from(e as Map),
      ),
    );
  }

  /// Adds a row to [users] for team assignment (no [auth.signUp]).
  ///
  /// Separate from [upsertCurrentUserFromSession]; depends on DB RLS for email-only rows.
  static Future<void> addTeamMemberEmail(String rawEmail) async {
    final email = rawEmail.trim();
    if (!email.contains('@')) {
      throw ArgumentError('Invalid email');
    }
    try {
      await _c.from('users').insert(<String, dynamic>{
        'email': email,
        'created_at': DateTime.now().toIso8601String(),
      });
    } catch (e, st) {
      debugPrint('UserService.addTeamMemberEmail: $e');
      debugPrint('$st');
      rethrow;
    }
  }
}
