import 'package:supabase_flutter/supabase_flutter.dart';

import '../../models/app_user.dart';
import '../team_repository.dart';

class SupabaseTeamRepository implements TeamRepository {
  SupabaseTeamRepository(this._client);
  final SupabaseClient _client;

  @override
  Future<List<AppUser>> fetchTeam({String? workspaceId}) async {
    if (workspaceId == null || workspaceId.isEmpty) {
      final rows = await _client.from('salespeople').select('*, profiles:profile_id(*)');
      return rows.map(_mapSalesperson).toList();
    }
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
    return rows.whereType<Map<String, dynamic>>().map(_mapWorkspaceMember).toList();
  }

  AppUser _mapSalesperson(Map<String, dynamic> row) {
    final profile = (row['profiles'] as Map<String, dynamic>?) ?? const {};
    final roleRaw = profile['role']?.toString() ?? 'sales';
    final role = _roleFrom(roleRaw);
    return AppUser(
      id: row['profile_id']?.toString() ?? row['id']?.toString() ?? '',
      fullName: row['display_name']?.toString() ?? profile['full_name']?.toString() ?? '',
      email: profile['email']?.toString() ?? '',
      phone: row['phone']?.toString() ?? '',
      role: role,
      businessId: '',
      isActive: row['is_active'] as bool? ?? true,
      createdAt: DateTime.tryParse(row['created_at']?.toString() ?? '') ?? DateTime.now(),
    );
  }

  AppUser _mapWorkspaceMember(Map<String, dynamic> row) {
    final profile = (row['profiles'] as Map<String, dynamic>?) ?? const {};
    return AppUser(
      id: row['profile_id']?.toString() ?? row['user_id']?.toString() ?? profile['id']?.toString() ?? '',
      fullName: row['display_name']?.toString() ?? profile['full_name']?.toString() ?? '',
      email: profile['email']?.toString() ?? '',
      phone: profile['phone']?.toString() ?? '',
      role: _roleFrom(row['role']?.toString()),
      businessId: '',
      isActive: row['status']?.toString() != 'disabled',
      createdAt: DateTime.tryParse(row['created_at']?.toString() ?? '') ?? DateTime.now(),
      workspaceId: row['workspace_id']?.toString(),
      membershipStatus: row['status']?.toString() ?? 'active',
      assignmentCapacity: (row['assignment_capacity'] as num?)?.toInt(),
    );
  }

  UserRole _roleFrom(String? raw) {
    return switch (raw) {
      'owner' => UserRole.owner,
      'admin' => UserRole.admin,
      'manager' => UserRole.manager,
      'sales' || 'salesperson' => UserRole.salesperson,
      _ => UserRole.salesperson,
    };
  }
}
