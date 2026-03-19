enum AssignmentRuleType {
  roundRobin,
  leastBusy,
  manualDefault,
  channelBased,
  cityBased,
}

class AssignmentRule {
  const AssignmentRule({
    required this.id,
    required this.workspaceId,
    required this.name,
    required this.type,
    required this.isActive,
    this.conditions = const {},
    this.config = const {},
    this.fallbackMemberId,
    this.createdBy,
    required this.createdAt,
    this.updatedAt,
  });

  final String id;
  final String workspaceId;
  final String name;
  final AssignmentRuleType type;
  final bool isActive;
  final Map<String, dynamic> conditions;
  final Map<String, dynamic> config;
  final String? fallbackMemberId;
  final String? createdBy;
  final DateTime createdAt;
  final DateTime? updatedAt;
}
