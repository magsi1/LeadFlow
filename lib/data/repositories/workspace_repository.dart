import '../models/app_user.dart';
import '../models/assignment_rule.dart';
import '../models/workspace.dart';
import '../models/workspace_invitation.dart';

abstract class WorkspaceRepository {
  Future<List<Workspace>> fetchWorkspaces();
  Future<List<AppUser>> fetchWorkspaceMembers(String workspaceId);
  Future<List<AssignmentRule>> fetchAssignmentRules(String workspaceId);
  Future<WorkspaceInvitation> createInvitation({
    required String workspaceId,
    required String email,
    required UserRole role,
    required String invitedBy,
  });
  Future<void> updateMemberRole({
    required String workspaceId,
    required String profileId,
    required UserRole role,
  });
  Future<void> updateMemberStatus({
    required String workspaceId,
    required String profileId,
    required String status,
  });
}
