class Workspace {
  const Workspace({
    required this.id,
    required this.name,
    required this.slug,
    this.ownerProfileId,
    this.plan = 'starter',
    this.isActive = true,
    required this.createdAt,
    this.updatedAt,
  });

  final String id;
  final String name;
  final String slug;
  final String? ownerProfileId;
  final String plan;
  final bool isActive;
  final DateTime createdAt;
  final DateTime? updatedAt;
}
