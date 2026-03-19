import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:uuid/uuid.dart';

import '../../models/app_user.dart';
import '../../models/assignment_rule.dart';
import '../../models/workspace.dart';
import '../../models/workspace_invitation.dart';
import '../workspace_repository.dart';

class SupabaseWorkspaceRepository implements WorkspaceRepository {
  SupabaseWorkspaceRepository(this._client);
  final SupabaseClient _client;
  final _uuid = const Uuid();

  @override
  Future<WorkspaceInvitation> createInvitation({
    required String workspaceId,
    required String email,
    required UserRole role,
    required String invitedBy,
  }) async {
    final token = _uuid.v4().replaceAll('-', '');
    final expiresAt = DateTime.now().add(const Duration(days: 7));
    final data = await _client
        .from('workspace_invitations')
        .insert({
          'workspace_id': workspaceId,
          'email': email.trim().toLowerCase(),
          'role': role.dbValue == 'sales' ? 'sales' : role.dbValue,
          'invited_by': invitedBy,
          'token': token,
          'status': 'pending',
          'expires_at': expiresAt.toIso8601String(),
        })
        .select()
        .single();
    return WorkspaceInvitation(
      id: data['id']?.toString() ?? '',
      workspaceId: data['workspace_id']?.toString() ?? workspaceId,
      email: data['email']?.toString() ?? email,
      role: data['role']?.toString() ?? role.dbValue,
      status: data['status']?.toString() ?? 'pending',
      token: data['token']?.toString() ?? token,
      expiresAt: DateTime.tryParse(data['expires_at']?.toString() ?? '') ?? expiresAt,
      createdAt: DateTime.tryParse(data['created_at']?.toString() ?? '') ?? DateTime.now(),
      invitedBy: data['invited_by']?.toString(),
    );
  }

  @override
  Future<List<AssignmentRule>> fetchAssignmentRules(String workspaceId) async {
    final rows = await _client
        .from('assignment_rules')
        .select()
        .eq('workspace_id', workspaceId)
        .order('created_at');
    return rows.whereType<Map<String, dynamic>>().map(_mapRule).toList();
  }

  @override
  Future<List<Workspace>> fetchWorkspaces() async {
    final userId = _client.auth.currentUser?.id;
    if (userId == null) return [];
    List<dynamic> rows;
    try {
      rows = await _client
          .from('workspace_members')
          .select('workspace_id, workspaces:workspace_id(*)')
          .eq('profile_id', userId)
          .eq('status', 'active');
    } catch (_) {
      try {
        rows = await _client
            .from('workspace_members')
            .select('workspace_id, workspaces:workspace_id(*)')
            .eq('user_id', userId)
            .eq('status', 'active');
      } catch (_) {
        try {
          rows = await _client
              .from('workspace_members')
              .select('workspace_id, workspaces:workspace_id(*)')
              .eq('profile_id', userId);
        } catch (_) {
          rows = await _client
              .from('workspace_members')
              .select('workspace_id, workspaces:workspace_id(*)')
              .eq('user_id', userId);
        }
      }
    }
    final list = rows
        .whereType<Map<String, dynamic>>()
        .map((row) => row['workspaces'])
        .whereType<Map<String, dynamic>>()
        .map(_mapWorkspace)
        .toList();
    return list;
  }

  @override
  Future<List<AppUser>> fetchWorkspaceMembers(String workspaceId) async {
    List<dynamic> rows;
    try {
      rows = await _client
          .from('workspace_members')
          .select('*, profiles:profile_id(*)')
          .eq('workspace_id', workspaceId)
          .order('created_at');
    } catch (_) {
      rows = await _client
          .from('workspace_members')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('created_at');
    }
    return rows.whereType<Map<String, dynamic>>().map(_mapMember).toList();
  }

  @override
  Future<void> updateMemberRole({
    required String workspaceId,
    required String profileId,
    required UserRole role,
  }) async {
    try {
      await _client
          .from('workspace_members')
          .update({
            'role': role.dbValue == 'sales' ? 'sales' : role.dbValue,
          })
          .eq('workspace_id', workspaceId)
          .eq('profile_id', profileId);
    } catch (_) {
      await _client
          .from('workspace_members')
          .update({
            'role': role.dbValue == 'sales' ? 'sales' : role.dbValue,
          })
          .eq('workspace_id', workspaceId)
          .eq('user_id', profileId);
    }
  }

  @override
  Future<void> updateMemberStatus({
    required String workspaceId,
    required String profileId,
    required String status,
  }) async {
    try {
      await _client
          .from('workspace_members')
          .update({'status': status})
          .eq('workspace_id', workspaceId)
          .eq('profile_id', profileId);
    } catch (_) {
      await _client
          .from('workspace_members')
          .update({'status': status})
          .eq('workspace_id', workspaceId)
          .eq('user_id', profileId);
    }
  }

  Workspace _mapWorkspace(Map<String, dynamic> row) {
    return Workspace(
      id: row['id']?.toString() ?? '',
      name: row['name']?.toString() ?? 'Workspace',
      slug: row['slug']?.toString() ?? '',
      ownerProfileId: row['owner_profile_id']?.toString() ?? row['owner_id']?.toString(),
      plan: row['plan']?.toString() ?? 'starter',
      isActive: row['is_active'] as bool? ?? true,
      createdAt: DateTime.tryParse(row['created_at']?.toString() ?? '') ?? DateTime.now(),
      updatedAt: DateTime.tryParse(row['updated_at']?.toString() ?? ''),
    );
  }

  AppUser _mapMember(Map<String, dynamic> row) {
    final profile = (row['profiles'] as Map<String, dynamic>?) ?? const {};
    final roleRaw = row['role']?.toString() ?? profile['role']?.toString();
    return AppUser(
      id: row['profile_id']?.toString() ?? row['user_id']?.toString() ?? profile['id']?.toString() ?? '',
      fullName: row['display_name']?.toString() ?? profile['full_name']?.toString() ?? '',
      email: profile['email']?.toString() ?? '',
      phone: profile['phone']?.toString() ?? '',
      role: _mapRole(roleRaw),
      businessId: '',
      isActive: row['status']?.toString() != 'disabled',
      createdAt: DateTime.tryParse(row['created_at']?.toString() ?? '') ?? DateTime.now(),
      workspaceId: row['workspace_id']?.toString(),
      membershipStatus: row['status']?.toString() ?? 'active',
      assignmentCapacity: (row['assignment_capacity'] as num?)?.toInt(),
    );
  }

  AssignmentRule _mapRule(Map<String, dynamic> row) {
    return AssignmentRule(
      id: row['id']?.toString() ?? '',
      workspaceId: row['workspace_id']?.toString() ?? '',
      name: row['name']?.toString() ?? 'Rule',
      type: _mapRuleType(row['rule_type']?.toString()),
      isActive: row['is_active'] as bool? ?? true,
      conditions: (row['conditions'] as Map<String, dynamic>?) ?? const {},
      config: (row['config'] as Map<String, dynamic>?) ?? const {},
      fallbackMemberId: row['fallback_member_id']?.toString(),
      createdBy: row['created_by']?.toString(),
      createdAt: DateTime.tryParse(row['created_at']?.toString() ?? '') ?? DateTime.now(),
      updatedAt: DateTime.tryParse(row['updated_at']?.toString() ?? ''),
    );
  }

  AssignmentRuleType _mapRuleType(String? value) {
    return switch (value) {
      'round_robin' => AssignmentRuleType.roundRobin,
      'least_busy' => AssignmentRuleType.leastBusy,
      'manual_default' => AssignmentRuleType.manualDefault,
      'channel_based' => AssignmentRuleType.channelBased,
      'city_based' => AssignmentRuleType.cityBased,
      _ => AssignmentRuleType.roundRobin,
    };
  }

  UserRole _mapRole(String? role) {
    return switch (role) {
      'owner' => UserRole.owner,
      'admin' => UserRole.admin,
      'manager' => UserRole.manager,
      'sales' => UserRole.salesperson,
      _ => UserRole.salesperson,
    };
  }
}
