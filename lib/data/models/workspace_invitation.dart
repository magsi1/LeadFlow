class WorkspaceInvitation {
  const WorkspaceInvitation({
    required this.id,
    required this.workspaceId,
    required this.email,
    required this.role,
    required this.status,
    required this.token,
    required this.expiresAt,
    required this.createdAt,
    this.invitedBy,
  });

  final String id;
  final String workspaceId;
  final String email;
  final String role;
  final String status;
  final String token;
  final DateTime expiresAt;
  final DateTime createdAt;
  final String? invitedBy;
}
