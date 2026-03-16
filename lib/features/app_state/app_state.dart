import '../../data/models/activity.dart';
import '../../data/models/app_user.dart';
import '../../data/models/follow_up.dart';
import '../../data/models/lead.dart';

class LeadFilters {
  const LeadFilters({
    this.search = '',
    this.status,
    this.source,
    this.assignedTo,
    this.temperature,
    this.city,
    this.followUpDueOnly = false,
  });

  final String search;
  final LeadStatus? status;
  final String? source;
  final String? assignedTo;
  final LeadTemperature? temperature;
  final String? city;
  final bool followUpDueOnly;

  LeadFilters copyWith({
    String? search,
    LeadStatus? status,
    String? source,
    String? assignedTo,
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
      temperature: clearTemperature ? null : temperature ?? this.temperature,
      city: clearCity ? null : city ?? this.city,
      followUpDueOnly: followUpDueOnly ?? this.followUpDueOnly,
    );
  }
}

class AppState {
  const AppState({
    this.currentUser,
    this.team = const [],
    this.leads = const [],
    this.activities = const [],
    this.followUps = const [],
    this.filters = const LeadFilters(),
    this.loading = false,
    this.error,
  });

  final AppUser? currentUser;
  final List<AppUser> team;
  final List<Lead> leads;
  final List<Activity> activities;
  final List<FollowUp> followUps;
  final LeadFilters filters;
  final bool loading;
  final String? error;

  bool get isAuthenticated => currentUser != null;
  bool get isAdmin => currentUser?.role == UserRole.admin;

  AppState copyWith({
    AppUser? currentUser,
    bool clearCurrentUser = false,
    List<AppUser>? team,
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
      team: team ?? this.team,
      leads: leads ?? this.leads,
      activities: activities ?? this.activities,
      followUps: followUps ?? this.followUps,
      filters: filters ?? this.filters,
      loading: loading ?? this.loading,
      error: clearError ? null : error ?? this.error,
    );
  }
}
