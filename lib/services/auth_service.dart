import 'package:supabase_flutter/supabase_flutter.dart';

/// Centralized auth helpers for LeadFlow (session via Supabase; persists on web).
class AuthService {
  AuthService._();

  static SupabaseClient get _client => Supabase.instance.client;

  static User? get currentUser => _client.auth.currentUser;

  /// User email for UI; never null string.
  static String get displayEmail => currentUser?.email ?? 'No Email';

  static Future<void> signOut() => _client.auth.signOut();
}
