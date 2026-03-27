class Lead {
  const Lead({
    required this.id,
    required this.name,
    required this.phone,
    this.email,
    required this.status,
    required this.createdAt,
  });

  final String id;
  final String name;
  final String phone;
  /// From API `email`; UI: `lead.email?.trim().isEmpty != false ? 'No Email' : lead.email!`
  final String? email;
  final String status;
  final String createdAt;

  factory Lead.fromJson(Map<String, dynamic> json) {
    final emailStr = json['email']?.toString().trim();
    return Lead(
      id: (json['id'] ?? '').toString(),
      name: (json['name'] ?? '').toString(),
      phone: (json['phone'] ?? '').toString(),
      email: (emailStr == null || emailStr.isEmpty) ? null : emailStr,
      status: (json['status'] ?? 'new').toString().toLowerCase(),
      createdAt: (json['created_at'] ?? '').toString(),
    );
  }
}
