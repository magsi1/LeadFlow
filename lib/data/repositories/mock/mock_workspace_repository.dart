import 'package:uuid/uuid.dart';

import '../../models/app_user.dart';
import '../../models/assignment_rule.dart';
import '../../models/workspace.dart';
import '../../models/workspace_invitation.dart';
import '../workspace_repository.dart';

class MockWorkspaceRepository implements WorkspaceRepository {
  final _uuid = const Uuid();
  final List<Workspace> _workspaces = [
    Workspace(
      id: 'ws_demo',
      name: 'LeadFlow Demo Workspace',
      slug: 'leadflow-demo',
      ownerProfileId: 'u_admin',
      plan: 'starter',
      isActive: true,
      createdAt: DateTime.now().subtract(const Duration(days: 40)),
      updatedAt: DateTime.now(),
    ),
    Workspace(
      id: 'ws_east',
      name: 'LeadFlow East Region',
      slug: 'leadflow-east',
      ownerProfileId: 'u_admin',
      plan: 'starter',
      isActive: true,
      createdAt: DateTime.now().subtract(const Duration(days: 12)),
      updatedAt: DateTime.now(),
    ),
  ];

  final List<WorkspaceInvitation> _invitations = [];

  @override
  Future<WorkspaceInvitation> createInvitation({
    required String workspaceId,
    required String email,
    required UserRole role,
    required String invitedBy,
  }) async {
    final invitation = WorkspaceInvitation(
      id: _uuid.v4(),
      workspaceId: workspaceId,
      email: email.trim().toLowerCase(),
      role: role.dbValue,
      status: 'pending',
      token: _uuid.v4().replaceAll('-', ''),
      expiresAt: DateTime.now().add(const Duration(days: 7)),
      createdAt: DateTime.now(),
      invitedBy: invitedBy,
    );
    _invitations.add(invitation);
    return invitation;
  }

  @override
  Future<List<AssignmentRule>> fetchAssignmentRules(String workspaceId) async {
    return [
      AssignmentRule(
        id: 'rule_rr_demo',
        workspaceId: workspaceId,
        name: 'Default Round Robin',
        type: AssignmentRuleType.roundRobin,
        isActive: true,
        conditions: const {},
        config: const {},
        createdBy: 'u_admin',
        createdAt: DateTime.now().subtract(const Duration(days: 20)),
      ),
      AssignmentRule(
        id: 'rule_city_khi',
        workspaceId: workspaceId,
        name: 'Karachi Leads -> Sana',
        type: AssignmentRuleType.cityBased,
        isActive: true,
        conditions: const {'city': 'Karachi'},
        config: const {'assigneeProfileId': 'u_sales_2'},
        fallbackMemberId: 'u_sales_1',
        createdBy: 'u_admin',
        createdAt: DateTime.now().subtract(const Duration(days: 10)),
      ),
    ];
  }

  @override
  Future<List<Workspace>> fetchWorkspaces() async => _workspaces;

  @override
  Future<List<AppUser>> fetchWorkspaceMembers(String workspaceId) async {
    return <AppUser>[];
  }

  @override
  Future<void> updateMemberRole({
    required String workspaceId,
    required String profileId,
    required UserRole role,
  }) async {
    // Demo repository is stateless across runs by design.
  }

  @override
  Future<void> updateMemberStatus({
    required String workspaceId,
    required String profileId,
    required String status,
  }) async {
    // Demo repository is stateless across runs by design.
  }
}
