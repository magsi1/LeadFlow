class FollowUp {
  const FollowUp({
    required this.id,
    required this.leadId,
    required this.assignedTo,
    required this.dueAt,
    required this.completed,
    required this.lastNote,
  });

  final String id;
  final String leadId;
  final String assignedTo;
  final DateTime dueAt;
  final bool completed;
  final String lastNote;

  FollowUp copyWith({DateTime? dueAt, bool? completed, String? lastNote}) => FollowUp(
        id: id,
        leadId: leadId,
        assignedTo: assignedTo,
        dueAt: dueAt ?? this.dueAt,
        completed: completed ?? this.completed,
        lastNote: lastNote ?? this.lastNote,
      );

  Map<String, dynamic> toMap() => {
        'id': id,
        'leadId': leadId,
        'assignedTo': assignedTo,
        'dueAt': dueAt.toIso8601String(),
        'completed': completed,
        'lastNote': lastNote,
      };

  factory FollowUp.fromMap(Map<String, dynamic> map) => FollowUp(
        id: map['id'] as String,
        leadId: map['leadId'] as String,
        assignedTo: map['assignedTo'] as String,
        dueAt: DateTime.tryParse(map['dueAt']?.toString() ?? '') ?? DateTime.now(),
        completed: map['completed'] as bool? ?? false,
        lastNote: map['lastNote'] as String? ?? '',
      );
}
