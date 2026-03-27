/// E.164-style: optional leading `+`, then 10–15 digits.
bool isValidPhone(String phone) {
  final cleaned = phone.trim();
  final regex = RegExp(r'^\+?[0-9]{10,15}$');
  return regex.hasMatch(cleaned);
}

/// Postgres unique violation / common API duplicate wording.
bool isLikelyDuplicateLeadError(Object error) {
  final t = error.toString().toLowerCase();
  return t.contains('duplicate') ||
      t.contains('unique') ||
      t.contains('23505') ||
      t.contains('already exists');
}
