class ApiLead {
  const ApiLead({
    required this.id,
    required this.name,
    required this.phone,
    this.email = '',
    required this.status,
    required this.createdAt,
  });

  final String id;
  final String name;
  final String phone;
  /// Contact email from API; empty if unknown.
  final String email;
  final String status;
  final DateTime? createdAt;

  ApiLead copyWith({
    String? id,
    String? name,
    String? phone,
    String? email,
    String? status,
    DateTime? createdAt,
  }) {
    return ApiLead(
      id: id ?? this.id,
      name: name ?? this.name,
      phone: phone ?? this.phone,
      email: email ?? this.email,
      status: status ?? this.status,
      createdAt: createdAt ?? this.createdAt,
    );
  }

  factory ApiLead.fromJson(Map<String, dynamic> map) {
    final createdRaw = map['created_at'];
    return ApiLead(
      id: (map['id'] ?? '').toString(),
      name: (map['name'] ?? '').toString(),
      phone: (map['phone'] ?? '').toString(),
      email: (map['email'] ?? '').toString(),
      status: (map['status'] ?? 'new').toString().toLowerCase(),
      createdAt: createdRaw == null ? null : DateTime.tryParse(createdRaw.toString()),
    );
  }

  Map<String, dynamic> toCreateJson() {
    return <String, dynamic>{
      'name': name,
      'phone': phone,
      if (email.isNotEmpty) 'email': email,
      'status': status,
    };
  }
}
