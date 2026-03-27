bool isValidEmail(String email) {
  final s = email.trim();
  if (s.isEmpty) return false;
  return RegExp(r'^[^@]+@[^@]+\.[^@]+$').hasMatch(s);
}

/// Common demo placeholders — not allowed for signup (use a real inbox you control).
bool isBlockedSignupPlaceholderEmail(String email) {
  switch (email.trim().toLowerCase()) {
    case 'user@gmail.com':
    case 'test@test.com':
    case 'user@user.com':
    case 'admin@admin.com':
    case 'email@test.com':
      return true;
    default:
      return false;
  }
}

/// Valid format and not a known placeholder (e.g. [user@gmail.com]).
bool isAcceptableSignupEmail(String email) {
  return isValidEmail(email) && !isBlockedSignupPlaceholderEmail(email);
}
