import '../../data/models/app_user.dart';

class PermissionHelper {
  static bool canManageTeam(AppUser? user) {
    if (user == null) return false;
    return user.role == UserRole.owner ||
        user.role == UserRole.admin ||
        user.role == UserRole.manager;
  }

  static bool canManageIntegrations(AppUser? user) {
    if (user == null) return false;
    return user.role == UserRole.owner || user.role == UserRole.admin;
  }

  static bool canSeeTeamTab(AppUser? user) => canManageTeam(user);
}
