class Activity {
  const Activity({
    required this.id,
    required this.leadId,
    required this.type,
    required this.message,
    required this.performedBy,
    required this.createdAt,
    this.metadata = const {},
  });

  final String id;
  final String leadId;
  final String type;
  final String message;
  final String performedBy;
  final DateTime createdAt;
  final Map<String, dynamic> metadata;

  Map<String, dynamic> toMap() => {
        'id': id,
        'leadId': leadId,
        'type': type,
        'message': message,
        'performedBy': performedBy,
        'createdAt': createdAt.toIso8601String(),
        'metadata': metadata,
      };

  factory Activity.fromMap(Map<String, dynamic> map) => Activity(
        id: map['id'] as String,
        leadId: map['leadId'] as String,
        type: map['type'] as String,
        message: map['message'] as String,
        performedBy: map['performedBy'] as String,
        createdAt: DateTime.tryParse(map['createdAt']?.toString() ?? '') ?? DateTime.now(),
        metadata: (map['metadata'] as Map<String, dynamic>?) ?? const {},
      );
}
