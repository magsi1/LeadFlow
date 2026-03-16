class Business {
  const Business({
    required this.id,
    required this.name,
    required this.category,
    required this.createdAt,
  });

  final String id;
  final String name;
  final String category;
  final DateTime createdAt;

  Map<String, dynamic> toMap() => {
        'id': id,
        'name': name,
        'category': category,
        'createdAt': createdAt.toIso8601String(),
      };

  factory Business.fromMap(Map<String, dynamic> map) => Business(
        id: map['id'] as String,
        name: map['name'] as String? ?? '',
        category: map['category'] as String? ?? '',
        createdAt: DateTime.tryParse(map['createdAt']?.toString() ?? '') ?? DateTime.now(),
      );
}
