class ApiLead {
  const ApiLead({
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
  final DateTime? createdAt;

  ApiLead copyWith({
    String? id,
    String? name,
    String? phone,
    String? status,
    DateTime? createdAt,
  }) {
    return ApiLead(
      id: id ?? this.id,
      name: name ?? this.name,
      phone: phone ?? this.phone,
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
      status: (map['status'] ?? 'new').toString().toLowerCase(),
      createdAt: createdRaw == null ? null : DateTime.tryParse(createdRaw.toString()),
    );
  }

  Map<String, dynamic> toCreateJson() {
    return <String, dynamic>{
      'name': name,
      'phone': phone,
      'status': status,
    };
  }
}
