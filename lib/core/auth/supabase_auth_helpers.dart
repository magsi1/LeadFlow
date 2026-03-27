import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Returns the current Supabase auth user, or `null` if signed out.
User? currentSupabaseUser() =>
    Supabase.instance.client.auth.currentUser;

/// Throws if there is no signed-in user (use for mutations that require RLS).
User requireLoggedInUser() {
  final user = currentSupabaseUser();
  if (user == null) {
    throw Exception('User not logged in');
  }
  return user;
}

/// Safe user id for read paths — returns `null` when signed out (no crash).
String? currentUserIdOrNull() => currentSupabaseUser()?.id;

/// Debug logging before `leads` table operations (RLS debugging).
void logLeadsDbOp(String operation, {Map<String, Object?>? extra}) {
  final uid = currentUserIdOrNull();
  final buf = StringBuffer('[LeadFlow][leads] $operation');
  if (uid != null) {
    final preview =
        uid.length <= 8 ? uid : '${uid.substring(0, 8)}…';
    buf.write(' user_id=$preview');
  } else {
    buf.write(' user_id=(none)');
  }
  if (extra != null && extra.isNotEmpty) {
    buf.write(' $extra');
  }
  debugPrint(buf.toString());
}
