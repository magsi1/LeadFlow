class Lead {
  const Lead({
    required this.id,
    required this.name,
    required this.phone,
    required this.status,
    required this.createdAt,
  });

  final String id;
  final String name;
  final String phone;
  final String status;
  final String createdAt;

  factory Lead.fromJson(Map<String, dynamic> json) {
    return Lead(
      id: (json['id'] ?? '').toString(),
      name: (json['name'] ?? '').toString(),
      phone: (json['phone'] ?? '').toString(),
      status: (json['status'] ?? 'new').toString().toLowerCase(),
      createdAt: (json['created_at'] ?? '').toString(),
    );
  }
}
