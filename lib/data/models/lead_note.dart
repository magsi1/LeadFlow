class LeadNote {
  const LeadNote({
    required this.id,
    required this.leadId,
    required this.userId,
    required this.content,
    required this.createdAt,
  });

  final String id;
  final String leadId;
  final String userId;
  final String content;
  final DateTime createdAt;

  factory LeadNote.fromJson(Map<String, dynamic> json) {
    final createdRaw = json['created_at'];
    return LeadNote(
      id: (json['id'] ?? '').toString(),
      leadId: (json['lead_id'] ?? '').toString(),
      userId: (json['user_id'] ?? '').toString(),
      content: (json['content'] ?? '').toString(),
      createdAt: createdRaw == null
          ? DateTime.now()
          : DateTime.tryParse(createdRaw.toString()) ?? DateTime.now(),
    );
  }

  Map<String, dynamic> toJson() {
    return <String, dynamic>{
      'id': id,
      'lead_id': leadId,
      'user_id': userId,
      'content': content,
      'created_at': createdAt.toUtc().toIso8601String(),
    };
  }

  /// Payload for insert (omit [id] when DB generates it).
  Map<String, dynamic> toInsertJson() {
    return <String, dynamic>{
      'lead_id': leadId,
      'user_id': userId,
      'content': content,
      'created_at': createdAt.toUtc().toIso8601String(),
    };
  }
}
