import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter/foundation.dart';

import '../../data/services/supabase_service.dart';
import '../../data/models/app_user.dart';
import '../../data/models/lead.dart';
import '../../data/repositories/auth_repository.dart';
import '../../data/repositories/lead_repository.dart';
import '../../data/repositories/supabase/supabase_auth_repository.dart';
import '../../data/repositories/supabase/supabase_lead_repository.dart';
import '../../data/repositories/supabase/supabase_team_repository.dart';
import '../../data/repositories/supabase/supabase_workspace_repository.dart';
import '../../data/repositories/team_repository.dart';
import '../../data/repositories/workspace_repository.dart';
import 'app_state.dart';
import 'app_state_notifier.dart';

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  final supabaseClient = SupabaseService.client;
  if (supabaseClient != null) {
    return SupabaseAuthRepository(supabaseClient);
  }
  throw StateError('Supabase client is unavailable. Authentication is required.');
});

final leadRepositoryProvider = Provider<LeadRepository>((ref) {
  final supabaseClient = SupabaseService.client;
  if (supabaseClient != null) {
    return SupabaseLeadRepository(supabaseClient);
  }
  throw StateError('Supabase client is unavailable. Lead data requires authentication.');
});

final teamRepositoryProvider = Provider<TeamRepository>((ref) {
  final supabaseClient = SupabaseService.client;
  if (supabaseClient != null) {
    return SupabaseTeamRepository(supabaseClient);
  }
  throw StateError('Supabase client is unavailable. Team data requires authentication.');
});

final workspaceRepositoryProvider = Provider<WorkspaceRepository>((ref) {
  final supabaseClient = SupabaseService.client;
  if (supabaseClient != null) {
    return SupabaseWorkspaceRepository(supabaseClient);
  }
  throw StateError('Supabase client is unavailable. Workspace data requires authentication.');
});

final appStateProvider = StateNotifierProvider<AppStateNotifier, AppState>((ref) {
  debugPrint('[LeadFlow] Provider init: appStateProvider');
  final notifier = AppStateNotifier(
    authRepository: ref.watch(authRepositoryProvider),
    leadRepository: ref.watch(leadRepositoryProvider),
    teamRepository: ref.watch(teamRepositoryProvider),
    workspaceRepository: ref.watch(workspaceRepositoryProvider),
  );
  notifier
      .initialize()
      .then((_) => debugPrint('[LeadFlow] Provider init complete: appStateProvider'))
      .catchError((Object e, StackTrace st) {
    debugPrint('[LeadFlow] Provider init failed: appStateProvider error=$e');
    debugPrint(st.toString());
  });
  return notifier;
});

final visibleLeadsProvider = Provider<List<Lead>>((ref) {
  final state = ref.watch(appStateProvider);
  final currentUser = state.currentUser;
  Iterable<Lead> leads = state.leads;
  if (currentUser != null && currentUser.role == UserRole.salesperson) {
    final salesCanViewUnassigned = state.assignmentRules.any(
      (r) => (r.config['sales_can_view_unassigned'] == true),
    );
    leads = leads.where(
      (e) => e.assignedTo == currentUser.id || (salesCanViewUnassigned && e.assignedTo.isEmpty),
    );
  }
  final filters = state.filters;
  if (filters.search.trim().isNotEmpty) {
    final s = filters.search.toLowerCase();
    leads = leads.where((e) =>
        e.customerName.toLowerCase().contains(s) ||
        e.phone.toLowerCase().contains(s) ||
        e.city.toLowerCase().contains(s) ||
        e.source.toLowerCase().contains(s));
  }
  if (filters.status != null) leads = leads.where((e) => e.status == filters.status);
  if (filters.source != null) leads = leads.where((e) => e.source == filters.source);
  if (filters.assignedTo != null) leads = leads.where((e) => e.assignedTo == filters.assignedTo);
  if (filters.myLeadsOnly && currentUser != null) {
    leads = leads.where((e) => e.assignedTo == currentUser.id);
  }
  if (filters.temperature != null) leads = leads.where((e) => e.temperature == filters.temperature);
  if (filters.city != null && filters.city!.isNotEmpty) {
    leads = leads.where((e) => e.city.toLowerCase().contains(filters.city!.toLowerCase()));
  }
  if (filters.followUpDueOnly) {
    final now = DateTime.now();
    final endOfDay = DateTime(now.year, now.month, now.day, 23, 59, 59);
    leads = leads.where(
      (e) =>
          e.nextFollowUpAt != null &&
          !e.nextFollowUpAt!.isAfter(endOfDay) &&
          e.status != LeadStatus.closedWon &&
          e.status != LeadStatus.closedLost,
    );
  }
  final list = leads.toList()..sort((a, b) => b.createdAt.compareTo(a.createdAt));
  return list;
});
