import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';

import '../../core/utils/iterable_extensions.dart';
import '../../data/models/activity.dart';
import '../../data/models/app_user.dart';
import '../../data/models/follow_up.dart';
import '../../data/models/lead.dart';
import '../../data/repositories/auth_repository.dart';
import '../../data/repositories/lead_repository.dart';
import '../../data/repositories/team_repository.dart';
import 'app_state.dart';

class AppStateNotifier extends StateNotifier<AppState> {
  AppStateNotifier({
    required AuthRepository authRepository,
    required LeadRepository leadRepository,
    required TeamRepository teamRepository,
  })  : _authRepository = authRepository,
        _leadRepository = leadRepository,
        _teamRepository = teamRepository,
        super(const AppState());

  final AuthRepository _authRepository;
  final LeadRepository _leadRepository;
  final TeamRepository _teamRepository;
  final _uuid = const Uuid();

  Future<T?> _safeLoad<T>(String label, Future<T> Function() task) async {
    try {
      final result = await task().timeout(const Duration(seconds: 6));
      debugPrint('[LeadFlow] $label loaded');
      return result;
    } catch (e) {
      debugPrint('[LeadFlow] $label failed: $e');
      return null;
    }
  }

  Future<void> initialize() async {
    state = state.copyWith(loading: true, clearError: true);
    debugPrint('[LeadFlow] AppState initialize begin');

    final user = await _safeLoad('session', () => _authRepository.restoreSession());
    final team = await _safeLoad('team', () => _teamRepository.fetchTeam()) ?? const <AppUser>[];
    final leads = await _safeLoad('leads', () => _leadRepository.fetchLeads()) ?? const <Lead>[];
    final activities = await _safeLoad('activities', () => _leadRepository.fetchActivities()) ?? const <Activity>[];
    final followUps = await _safeLoad('followUps', () => _leadRepository.fetchFollowUps()) ?? const <FollowUp>[];

    // Web demo fallback: auto-enter app if no auth session and demo data exists.
    final fallbackDemoUser = team.where((u) => u.role == UserRole.admin).cast<AppUser?>().firstOrNull ??
        team.cast<AppUser?>().firstOrNull;
    final effectiveUser = user ?? ((kIsWeb && leads.isNotEmpty) ? fallbackDemoUser : null);

    if (effectiveUser != null && user == null && kIsWeb) {
      debugPrint('[LeadFlow] No session found. Using web demo fallback user.');
    }

    state = state.copyWith(
      currentUser: effectiveUser,
      team: team,
      leads: leads,
      activities: activities,
      followUps: followUps,
      loading: false,
    );
    debugPrint('[LeadFlow] AppState initialize complete');
  }

  Future<void> signIn({required String email, required String password}) async {
    state = state.copyWith(loading: true, clearError: true);
    try {
      final user = await _authRepository.signIn(email: email, password: password);
      state = state.copyWith(currentUser: user, loading: false);
    } catch (e) {
      state = state.copyWith(loading: false, error: e.toString());
      rethrow;
    }
  }

  Future<void> signOut() async {
    await _authRepository.signOut();
    state = state.copyWith(clearCurrentUser: true);
  }

  Future<void> refreshData() async {
    final leads = await _leadRepository.fetchLeads();
    final activities = await _leadRepository.fetchActivities();
    final followUps = await _leadRepository.fetchFollowUps();
    state = state.copyWith(leads: leads, activities: activities, followUps: followUps);
  }

  void updateFilters(LeadFilters filters) => state = state.copyWith(filters: filters);

  Future<void> saveLead(Lead lead, {bool isNew = false}) async {
    final saved = await _leadRepository.saveLead(lead.copyWith(updatedAt: DateTime.now()));
    await _leadRepository.addActivity(
      Activity(
        id: _uuid.v4(),
        leadId: saved.id,
        type: isNew ? 'lead_created' : 'lead_updated',
        message: isNew ? 'Lead created.' : 'Lead updated.',
        performedBy: state.currentUser?.id ?? 'system',
        createdAt: DateTime.now(),
      ),
    );
    await refreshData();
  }

  Future<void> changeLeadStatus(Lead lead, LeadStatus status) async {
    final updated = lead.copyWith(status: status, updatedAt: DateTime.now());
    await _leadRepository.saveLead(updated);
    await _leadRepository.addActivity(
      Activity(
        id: _uuid.v4(),
        leadId: lead.id,
        type: 'status_changed',
        message: 'Status changed to ${status.name}.',
        performedBy: state.currentUser?.id ?? 'system',
        createdAt: DateTime.now(),
      ),
    );
    await refreshData();
  }

  Future<void> assignLead(Lead lead, String userId) async {
    final updated = lead.copyWith(assignedTo: userId, updatedAt: DateTime.now());
    await _leadRepository.saveLead(updated);
    await _leadRepository.addActivity(
      Activity(
        id: _uuid.v4(),
        leadId: lead.id,
        type: 'assigned',
        message: 'Lead assigned to $userId.',
        performedBy: state.currentUser?.id ?? 'system',
        createdAt: DateTime.now(),
      ),
    );
    await refreshData();
  }

  Future<void> addNote(Lead lead, String note) async {
    final updated = lead.copyWith(notesSummary: note, updatedAt: DateTime.now());
    await _leadRepository.saveLead(updated);
    await _leadRepository.addActivity(
      Activity(
        id: _uuid.v4(),
        leadId: lead.id,
        type: 'note_added',
        message: note,
        performedBy: state.currentUser?.id ?? 'system',
        createdAt: DateTime.now(),
      ),
    );
    await refreshData();
  }

  Future<void> scheduleFollowUp(Lead lead, DateTime dueAt, {String? note}) async {
    final updated = lead.copyWith(nextFollowUpAt: dueAt, updatedAt: DateTime.now());
    await _leadRepository.saveLead(updated);
    await _leadRepository.saveFollowUp(
      FollowUp(
        id: _uuid.v4(),
        leadId: lead.id,
        assignedTo: lead.assignedTo,
        dueAt: dueAt,
        completed: false,
        lastNote: note ?? lead.notesSummary,
      ),
    );
    await _leadRepository.addActivity(
      Activity(
        id: _uuid.v4(),
        leadId: lead.id,
        type: 'followup_scheduled',
        message: 'Follow-up set for ${dueAt.toLocal()}.',
        performedBy: state.currentUser?.id ?? 'system',
        createdAt: DateTime.now(),
      ),
    );
    await refreshData();
  }

  Future<void> completeFollowUp(FollowUp followUp) async {
    await _leadRepository.saveFollowUp(followUp.copyWith(completed: true));
    await _leadRepository.addActivity(
      Activity(
        id: _uuid.v4(),
        leadId: followUp.leadId,
        type: 'followup_completed',
        message: 'Follow-up marked completed.',
        performedBy: state.currentUser?.id ?? 'system',
        createdAt: DateTime.now(),
      ),
    );
    await refreshData();
  }

  Future<void> resetDemoData() async {
    state = state.copyWith(loading: true, clearError: true);
    try {
      await _leadRepository.resetDemoData();
      await refreshData();
      state = state.copyWith(filters: const LeadFilters(), loading: false);
    } catch (e) {
      state = state.copyWith(loading: false, error: e.toString());
    }
  }
}
