import 'package:supabase_flutter/supabase_flutter.dart';

/// Thrown from signup flows so UI can show [message] without an `Exception:` prefix.
class SignupFailure implements Exception {
  SignupFailure(this.message);
  final String message;

  @override
  String toString() => message;
}

/// Shown when the provider returns rate-limit / too-many-requests style errors.
const String signupRateLimitUserMessage = 'Too many attempts. Please wait.';

/// True when [error] text indicates email/auth rate limiting (Supabase, etc.).
bool isSignupRateLimited(Object error) {
  final text = error is AuthException
      ? '${error.message} ${error.toString()}'
      : error.toString();
  final m = text.toLowerCase();
  return m.contains('rate limit') || m.contains('too many requests');
}

/// Maps Supabase [AuthException] to short UI copy; otherwise returns [AuthException.message].
String friendlySignupAuthMessage(AuthException e) {
  final raw = e.message;
  final m = raw.toLowerCase();

  if (_alreadyRegistered(m)) return 'User already registered';
  if (_weakPassword(m)) return 'Weak password';
  if (_invalidEmail(m)) return 'Invalid email';

  return raw;
}

bool _alreadyRegistered(String m) {
  return m.contains('already registered') ||
      m.contains('user already registered') ||
      m.contains('already exists') ||
      m.contains('email address is already') ||
      m.contains('already been registered');
}

bool _weakPassword(String m) {
  if (!m.contains('password')) return false;
  return m.contains('weak') ||
      m.contains('at least') ||
      m.contains('minimum') ||
      m.contains('too short') ||
      m.contains('longer') ||
      m.contains('characters') ||
      m.contains('strength');
}

bool _invalidEmail(String m) {
  return m.contains('invalid email') ||
      m.contains('invalid format') ||
      (m.contains('email') && m.contains('invalid')) ||
      m.contains('not a valid email') ||
      m.contains('unable to validate email');
}
