import '../../../core/network/backend_api_client.dart';
import '../../models/app_user.dart';
import '../../models/assignment_rule.dart';
import '../../models/workspace.dart';
import '../../models/workspace_invitation.dart';
import '../workspace_repository.dart';

class RemoteWorkspaceRepository implements WorkspaceRepository {
  RemoteWorkspaceRepository(this._apiClient);
  final BackendApiClient _apiClient;

  @override
  Future<WorkspaceInvitation> createInvitation({
    required String workspaceId,
    required String email,
    required UserRole role,
    required String invitedBy,
  }) async {
    final response = await _apiClient.post('/api/workspaces/$workspaceId/invitations', body: {
      'email': email,
      'role': role.dbValue,
      'invitedBy': invitedBy,
    });
    final data = (response['invitation'] as Map<String, dynamic>?) ?? response;
    return WorkspaceInvitation(
      id: data['id']?.toString() ?? '',
      workspaceId: data['workspace_id']?.toString() ?? workspaceId,
      email: data['email']?.toString() ?? email,
      role: data['role']?.toString() ?? role.dbValue,
      status: data['status']?.toString() ?? 'pending',
      token: data['token']?.toString() ?? '',
      expiresAt: DateTime.tryParse(data['expires_at']?.toString() ?? '') ??
          DateTime.now().add(const Duration(days: 7)),
      createdAt: DateTime.tryParse(data['created_at']?.toString() ?? '') ?? DateTime.now(),
      invitedBy: data['invited_by']?.toString(),
    );
  }

  @override
  Future<List<AssignmentRule>> fetchAssignmentRules(String workspaceId) async {
    final response = await _apiClient.get('/api/workspaces/$workspaceId/assignment-rules');
    final rows = response['rules'];
    if (rows is! List) return [];
    return rows.whereType<Map<String, dynamic>>().map(_toRule).toList();
  }

  @override
  Future<List<Workspace>> fetchWorkspaces() async {
    final response = await _apiClient.get('/api/workspaces');
    final rows = response['workspaces'];
    if (rows is! List) return [];
    return rows.whereType<Map<String, dynamic>>().map(_toWorkspace).toList();
  }

  @override
  Future<List<AppUser>> fetchWorkspaceMembers(String workspaceId) async {
    final response = await _apiClient.get('/api/workspaces/$workspaceId/members');
    final rows = response['members'];
    if (rows is! List) return [];
    return rows.whereType<Map<String, dynamic>>().map(_toMember).toList();
  }

  @override
  Future<void> updateMemberRole({
    required String workspaceId,
    required String profileId,
    required UserRole role,
  }) async {
    await _apiClient.patch('/api/workspaces/$workspaceId/members/$profileId/role', body: {
      'role': role.dbValue,
    });
  }

  @override
  Future<void> updateMemberStatus({
    required String workspaceId,
    required String profileId,
    required String status,
  }) async {
    await _apiClient.patch('/api/workspaces/$workspaceId/members/$profileId/status', body: {
      'status': status,
    });
  }

  Workspace _toWorkspace(Map<String, dynamic> row) {
    return Workspace(
      id: row['id']?.toString() ?? '',
      name: row['name']?.toString() ?? 'Workspace',
      slug: row['slug']?.toString() ?? '',
      ownerProfileId: row['owner_profile_id']?.toString(),
      plan: row['plan']?.toString() ?? 'starter',
      isActive: row['is_active'] as bool? ?? true,
      createdAt: DateTime.tryParse(row['created_at']?.toString() ?? '') ?? DateTime.now(),
      updatedAt: DateTime.tryParse(row['updated_at']?.toString() ?? ''),
    );
  }

  AppUser _toMember(Map<String, dynamic> row) {
    return AppUser(
      id: row['profile_id']?.toString() ?? row['id']?.toString() ?? '',
      fullName: row['display_name']?.toString() ?? row['full_name']?.toString() ?? '',
      email: row['email']?.toString() ?? '',
      phone: row['phone']?.toString() ?? '',
      role: _roleFrom(row['role']?.toString()),
      businessId: '',
      isActive: row['status']?.toString() != 'disabled',
      createdAt: DateTime.tryParse(row['created_at']?.toString() ?? '') ?? DateTime.now(),
      workspaceId: row['workspace_id']?.toString(),
      membershipStatus: row['status']?.toString() ?? 'active',
      assignmentCapacity: (row['assignment_capacity'] as num?)?.toInt(),
    );
  }

  AssignmentRule _toRule(Map<String, dynamic> row) {
    return AssignmentRule(
      id: row['id']?.toString() ?? '',
      workspaceId: row['workspace_id']?.toString() ?? '',
      name: row['name']?.toString() ?? 'Rule',
      type: _ruleType(row['rule_type']?.toString()),
      isActive: row['is_active'] as bool? ?? true,
      conditions: (row['conditions'] as Map<String, dynamic>?) ?? const {},
      config: (row['config'] as Map<String, dynamic>?) ?? const {},
      fallbackMemberId: row['fallback_member_id']?.toString(),
      createdBy: row['created_by']?.toString(),
      createdAt: DateTime.tryParse(row['created_at']?.toString() ?? '') ?? DateTime.now(),
      updatedAt: DateTime.tryParse(row['updated_at']?.toString() ?? ''),
    );
  }

  AssignmentRuleType _ruleType(String? value) {
    return switch (value) {
      'round_robin' => AssignmentRuleType.roundRobin,
      'least_busy' => AssignmentRuleType.leastBusy,
      'manual_default' => AssignmentRuleType.manualDefault,
      'channel_based' => AssignmentRuleType.channelBased,
      'city_based' => AssignmentRuleType.cityBased,
      _ => AssignmentRuleType.roundRobin,
    };
  }

  UserRole _roleFrom(String? value) {
    return switch (value) {
      'owner' => UserRole.owner,
      'admin' => UserRole.admin,
      'manager' => UserRole.manager,
      _ => UserRole.salesperson,
    };
  }
}
