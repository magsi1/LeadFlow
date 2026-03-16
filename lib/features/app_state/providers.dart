import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/models/app_user.dart';
import '../../data/models/lead.dart';
import '../../data/repositories/auth_repository.dart';
import '../../data/repositories/lead_repository.dart';
import '../../data/repositories/mock/mock_auth_repository.dart';
import '../../data/repositories/mock/mock_lead_repository.dart';
import '../../data/repositories/mock/mock_team_repository.dart';
import '../../data/repositories/team_repository.dart';
import 'app_state.dart';
import 'app_state_notifier.dart';

final authRepositoryProvider = Provider<AuthRepository>((ref) => MockAuthRepository());
final leadRepositoryProvider = Provider<LeadRepository>((ref) => MockLeadRepository());
final teamRepositoryProvider = Provider<TeamRepository>((ref) => MockTeamRepository());

final appStateProvider = StateNotifierProvider<AppStateNotifier, AppState>((ref) {
  final notifier = AppStateNotifier(
    authRepository: ref.watch(authRepositoryProvider),
    leadRepository: ref.watch(leadRepositoryProvider),
    teamRepository: ref.watch(teamRepositoryProvider),
  );
  notifier.initialize();
  return notifier;
});

final visibleLeadsProvider = Provider<List<Lead>>((ref) {
  final state = ref.watch(appStateProvider);
  final currentUser = state.currentUser;
  Iterable<Lead> leads = state.leads;
  if (currentUser != null && currentUser.role == UserRole.salesperson) {
    leads = leads.where((e) => e.assignedTo == currentUser.id);
  }
  final filters = state.filters;
  if (filters.search.trim().isNotEmpty) {
    final s = filters.search.toLowerCase();
    leads = leads.where((e) =>
        e.customerName.toLowerCase().contains(s) ||
        e.phone.toLowerCase().contains(s) ||
        e.city.toLowerCase().contains(s));
  }
  if (filters.status != null) leads = leads.where((e) => e.status == filters.status);
  if (filters.source != null) leads = leads.where((e) => e.source == filters.source);
  if (filters.assignedTo != null) leads = leads.where((e) => e.assignedTo == filters.assignedTo);
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
