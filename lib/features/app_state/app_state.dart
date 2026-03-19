import '../../data/models/activity.dart';
import '../../data/models/app_user.dart';
import '../../data/models/assignment_rule.dart';
import '../../data/models/follow_up.dart';
import '../../data/models/lead.dart';
import '../../data/models/workspace.dart';
import '../../core/utils/permission_helper.dart';

class LeadFilters {
  const LeadFilters({
    this.search = '',
    this.status,
    this.source,
    this.assignedTo,
    this.myLeadsOnly = false,
    this.temperature,
    this.city,
    this.followUpDueOnly = false,
  });

  final String search;
  final LeadStatus? status;
  final String? source;
  final String? assignedTo;
  final bool myLeadsOnly;
  final LeadTemperature? temperature;
  final String? city;
  final bool followUpDueOnly;

  LeadFilters copyWith({
    String? search,
    LeadStatus? status,
    String? source,
    String? assignedTo,
    bool? myLeadsOnly,
    LeadTemperature? temperature,
    String? city,
    bool? followUpDueOnly,
    bool clearStatus = false,
    bool clearSource = false,
    bool clearAssignedTo = false,
    bool clearTemperature = false,
    bool clearCity = false,
  }) {
    return LeadFilters(
      search: search ?? this.search,
      status: clearStatus ? null : status ?? this.status,
      source: clearSource ? null : source ?? this.source,
      assignedTo: clearAssignedTo ? null : assignedTo ?? this.assignedTo,
      myLeadsOnly: myLeadsOnly ?? this.myLeadsOnly,
      temperature: clearTemperature ? null : temperature ?? this.temperature,
      city: clearCity ? null : city ?? this.city,
      followUpDueOnly: followUpDueOnly ?? this.followUpDueOnly,
    );
  }
}

class AppState {
  const AppState({
    this.currentUser,
    this.workspaces = const [],
    this.activeWorkspaceId,
    this.team = const [],
    this.assignmentRules = const [],
    this.leads = const [],
    this.activities = const [],
    this.followUps = const [],
    this.filters = const LeadFilters(),
    this.loading = false,
    this.error,
  });

  final AppUser? currentUser;
  final List<Workspace> workspaces;
  final String? activeWorkspaceId;
  final List<AppUser> team;
  final List<AssignmentRule> assignmentRules;
  final List<Lead> leads;
  final List<Activity> activities;
  final List<FollowUp> followUps;
  final LeadFilters filters;
  final bool loading;
  final String? error;

  bool get isAuthenticated => currentUser != null;
  bool get isAdmin => currentUser?.role == UserRole.owner || currentUser?.role == UserRole.admin;
  bool get canManageTeam => PermissionHelper.canManageTeam(currentUser);
  bool get canManageIntegrations => PermissionHelper.canManageIntegrations(currentUser);
  Workspace? get activeWorkspace {
    final id = activeWorkspaceId;
    if (id == null) return null;
    for (final w in workspaces) {
      if (w.id == id) return w;
    }
    return null;
  }

  AppState copyWith({
    AppUser? currentUser,
    bool clearCurrentUser = false,
    List<Workspace>? workspaces,
    String? activeWorkspaceId,
    bool clearActiveWorkspaceId = false,
    List<AppUser>? team,
    List<AssignmentRule>? assignmentRules,
    List<Lead>? leads,
    List<Activity>? activities,
    List<FollowUp>? followUps,
    LeadFilters? filters,
    bool? loading,
    String? error,
    bool clearError = false,
  }) {
    return AppState(
      currentUser: clearCurrentUser ? null : currentUser ?? this.currentUser,
      workspaces: workspaces ?? this.workspaces,
      activeWorkspaceId: clearActiveWorkspaceId ? null : activeWorkspaceId ?? this.activeWorkspaceId,
      team: team ?? this.team,
      assignmentRules: assignmentRules ?? this.assignmentRules,
      leads: leads ?? this.leads,
      activities: activities ?? this.activities,
      followUps: followUps ?? this.followUps,
      filters: filters ?? this.filters,
      loading: loading ?? this.loading,
      error: clearError ? null : error ?? this.error,
    );
  }
}
