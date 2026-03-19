import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'dart:async';

import '../../data/models/activity.dart';
import '../../data/models/app_user.dart';
import '../../data/models/assignment_rule.dart';
import '../../data/models/follow_up.dart';
import '../../data/models/lead.dart';
import '../../data/models/workspace.dart';
import '../../data/repositories/auth_repository.dart';
import '../../data/repositories/lead_repository.dart';
import '../../data/repositories/team_repository.dart';
import '../../data/repositories/workspace_repository.dart';
import 'app_state.dart';

class AppStateNotifier extends StateNotifier<AppState> {
  AppStateNotifier({
    required AuthRepository authRepository,
    required LeadRepository leadRepository,
    required TeamRepository teamRepository,
    required WorkspaceRepository workspaceRepository,
  })  : _authRepository = authRepository,
        _leadRepository = leadRepository,
        _teamRepository = teamRepository,
        _workspaceRepository = workspaceRepository,
        super(const AppState());

  final AuthRepository _authRepository;
  final LeadRepository _leadRepository;
  final TeamRepository _teamRepository;
  final WorkspaceRepository _workspaceRepository;
  final _uuid = const Uuid();
  static const _activeWorkspaceKey = 'leadflow_active_workspace_id';
  StreamSubscription<void>? _dataSubscription;
  Timer? _refreshDebounce;

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
    try {
      state = state.copyWith(loading: true, clearError: true);
      debugPrint('[LeadFlow] AppState initialize begin');
      debugPrint('[LeadFlow] Data STEP A: restore session');
      final user = await _safeLoad('session', () => _authRepository.restoreSession());
      if (user == null) {
        throw Exception('User must be logged in');
      }
      debugPrint('[LeadFlow] Data STEP B: session restored');

      debugPrint('[LeadFlow] Data STEP C: fetch workspaces');
      final workspaces = await _safeLoad('workspaces', () => _workspaceRepository.fetchWorkspaces()) ?? const <Workspace>[];
      final persistedWorkspaceId = await _readPersistedWorkspaceId();
      final resolvedWorkspaceId = _resolveWorkspaceId(
        workspaces,
        persistedWorkspaceId: persistedWorkspaceId,
      );
      debugPrint('[LeadFlow] Data STEP D: fetch team');
      final team = await _safeLoad(
            'team',
            () => _teamRepository.fetchTeam(workspaceId: resolvedWorkspaceId),
          ) ??
          const <AppUser>[];
      debugPrint('[LeadFlow] Data STEP E: fetch assignment rules');
      final assignmentRules = resolvedWorkspaceId == null
          ? const <AssignmentRule>[]
          : (await _safeLoad(
                    'assignmentRules',
                    () => _workspaceRepository.fetchAssignmentRules(resolvedWorkspaceId),
                  ) ??
              const <AssignmentRule>[]);
      debugPrint('[LeadFlow] Data STEP F: fetch leads');
      final leads = await _safeLoad('leads', () => _leadRepository.fetchLeads()) ?? const <Lead>[];
      debugPrint('[LeadFlow] Data STEP G: fetch activities');
      final activities = await _safeLoad('activities', () => _leadRepository.fetchActivities()) ?? const <Activity>[];
      debugPrint('[LeadFlow] Data STEP H: fetch follow-ups');
      final followUps = await _safeLoad('followUps', () => _leadRepository.fetchFollowUps()) ?? const <FollowUp>[];

      state = state.copyWith(
        currentUser: user,
        workspaces: workspaces,
        activeWorkspaceId: resolvedWorkspaceId,
        team: team,
        assignmentRules: assignmentRules,
        leads: leads,
        activities: activities,
        followUps: followUps,
        loading: false,
      );
      if (resolvedWorkspaceId != null) {
        await _persistWorkspaceId(resolvedWorkspaceId);
      }
      debugPrint('[LeadFlow] AppState initialize complete');
      _bindRealtimeSync();
    } catch (e, st) {
      debugPrint('[LeadFlow] AppState initialize fatal: $e');
      debugPrint(st.toString());
      state = state.copyWith(
        loading: false,
        error: e.toString(),
      );
    }
  }

  Future<void> signIn({required String email, required String password}) async {
    state = state.copyWith(loading: true, clearError: true);
    try {
      final normalizedEmail = email.trim();
      final normalizedPassword = password.trim();
      final client = Supabase.instance.client;
      debugPrint('[LOGIN ATTEMPT] email=$normalizedEmail');
      final response = await client.auth.signInWithPassword(
        email: normalizedEmail,
        password: normalizedPassword,
      );
      debugPrint('[LOGIN SUCCESS] user=${response.user?.email}');

      final authUser = client.auth.currentUser;
      if (authUser != null) {
        try {
          final existing = await client
              .from('profiles')
              .select()
              .eq('id', authUser.id)
              .maybeSingle();

          if (existing == null) {
            debugPrint('[PROFILE CREATE] Creating new profile');
            await client.from('profiles').insert({
              'id': authUser.id,
              'email': authUser.email,
            });
          } else {
            debugPrint('[PROFILE EXISTS]');
          }
        } catch (e) {
          // Do not block sign-in navigation if profile bootstrap fails.
          debugPrint('[PROFILE ERROR] $e');
        }

        await _ensureWorkspaceBootstrap(client, authUser);
      }

      final user = await _authRepository.restoreSession();
      if (user == null) {
        throw Exception('Login succeeded but user profile is unavailable.');
      }
      state = state.copyWith(currentUser: user, loading: false);
    } on AuthApiException catch (e) {
      debugPrint('[LOGIN ERROR FULL] ${e.toString()}');
      final friendlyMessage = _friendlyAuthMessage(e);
      state = state.copyWith(loading: false, error: friendlyMessage);
      throw Exception(friendlyMessage);
    } catch (e) {
      debugPrint('[LOGIN ERROR FULL] ${e.toString()}');
      const friendlyMessage = 'Unable to sign in right now. Please try again.';
      state = state.copyWith(loading: false, error: friendlyMessage);
      throw Exception(friendlyMessage);
    }
  }

  Future<void> signUp({
    required String fullName,
    required String email,
    required String password,
  }) async {
    state = state.copyWith(loading: true, clearError: true);
    try {
      final user = await _authRepository.signUp(fullName: fullName, email: email, password: password);
      state = state.copyWith(currentUser: user, loading: false);
      await refreshData();
    } catch (e) {
      state = state.copyWith(loading: false, error: e.toString());
      rethrow;
    }
  }

  Future<void> signOut() async {
    await _authRepository.signOut();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_activeWorkspaceKey);
    } catch (_) {
      // No-op in case persistence is unavailable.
    }
    state = state.copyWith(clearCurrentUser: true, clearActiveWorkspaceId: true);
  }

  Future<void> refreshData() async {
    final workspaceId = state.activeWorkspaceId;
    final team = await _teamRepository.fetchTeam(workspaceId: workspaceId);
    final assignmentRules = workspaceId == null
        ? const <AssignmentRule>[]
        : await _workspaceRepository.fetchAssignmentRules(workspaceId);
    final leads = await _leadRepository.fetchLeads();
    final activities = await _leadRepository.fetchActivities();
    final followUps = await _leadRepository.fetchFollowUps();
    state = state.copyWith(
      team: team,
      assignmentRules: assignmentRules,
      leads: leads,
      activities: activities,
      followUps: followUps,
    );
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

  Future<void> switchWorkspace(String workspaceId) async {
    if (state.activeWorkspaceId == workspaceId) return;
    state = state.copyWith(activeWorkspaceId: workspaceId);
    await _persistWorkspaceId(workspaceId);
    await refreshData();
  }

  Future<void> inviteWorkspaceMember({
    required String email,
    required UserRole role,
  }) async {
    final workspaceId = state.activeWorkspaceId;
    final currentUserId = state.currentUser?.id;
    if (workspaceId == null || currentUserId == null) return;
    await _workspaceRepository.createInvitation(
      workspaceId: workspaceId,
      email: email,
      role: role,
      invitedBy: currentUserId,
    );
    await logActivity(
      type: 'workspace_member_invited',
      message: 'Invitation created for $email (${role.name})',
      metadata: {'workspaceId': workspaceId},
    );
  }

  Future<void> changeWorkspaceMemberRole({
    required String profileId,
    required UserRole role,
  }) async {
    final workspaceId = state.activeWorkspaceId;
    if (workspaceId == null) return;
    await _workspaceRepository.updateMemberRole(
      workspaceId: workspaceId,
      profileId: profileId,
      role: role,
    );
    await refreshData();
  }

  Future<void> changeWorkspaceMemberStatus({
    required String profileId,
    required String status,
  }) async {
    final workspaceId = state.activeWorkspaceId;
    if (workspaceId == null) return;
    await _workspaceRepository.updateMemberStatus(
      workspaceId: workspaceId,
      profileId: profileId,
      status: status,
    );
    await refreshData();
  }

  Future<void> logActivity({
    required String type,
    required String message,
    String? leadId,
    Map<String, dynamic>? metadata,
  }) async {
    await _leadRepository.addActivity(
      Activity(
        id: _uuid.v4(),
        leadId: leadId ?? '',
        type: type,
        message: message,
        performedBy: state.currentUser?.id ?? 'system',
        createdAt: DateTime.now(),
        metadata: metadata ?? const {},
      ),
    );
  }

  void _bindRealtimeSync() {
    _dataSubscription?.cancel();
    _dataSubscription = _leadRepository.watchDataChanges().listen((_) {
      _refreshDebounce?.cancel();
      _refreshDebounce = Timer(const Duration(milliseconds: 220), () async {
        await refreshData();
      });
    });
  }

  String? _resolveWorkspaceId(
    List<Workspace> workspaces, {
    String? persistedWorkspaceId,
  }) {
    if (workspaces.isEmpty) return null;
    if (persistedWorkspaceId != null && workspaces.any((w) => w.id == persistedWorkspaceId)) {
      return persistedWorkspaceId;
    }
    final active = state.activeWorkspaceId;
    if (active != null && workspaces.any((w) => w.id == active)) return active;
    return workspaces.first.id;
  }

  Future<String?> _readPersistedWorkspaceId() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      return prefs.getString(_activeWorkspaceKey);
    } catch (_) {
      return null;
    }
  }

  Future<void> _persistWorkspaceId(String workspaceId) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_activeWorkspaceKey, workspaceId);
    } catch (_) {
      // No-op: persistence failure should not block runtime.
    }
  }

  Future<void> _ensureWorkspaceBootstrap(SupabaseClient client, User authUser) async {
    try {
      Map<String, dynamic>? existingMembership;
      try {
        existingMembership = await client
            .from('workspace_members')
            .select('workspace_id')
            .eq('profile_id', authUser.id)
            .eq('status', 'active')
            .limit(1)
            .maybeSingle();
      } catch (_) {
        try {
          existingMembership = await client
              .from('workspace_members')
              .select('workspace_id')
              .eq('user_id', authUser.id)
              .eq('status', 'active')
              .limit(1)
              .maybeSingle();
        } catch (_) {
          try {
            existingMembership = await client
                .from('workspace_members')
                .select('workspace_id')
                .eq('profile_id', authUser.id)
                .limit(1)
                .maybeSingle();
          } catch (_) {
            existingMembership = await client
                .from('workspace_members')
                .select('workspace_id')
                .eq('user_id', authUser.id)
                .limit(1)
                .maybeSingle();
          }
        }
      }
      if (existingMembership != null) {
        debugPrint('[WORKSPACE EXISTS]');
        return;
      }

      final slugSeed = DateTime.now().millisecondsSinceEpoch;
      final workspace = await client
          .from('workspaces')
          .insert({
            'name': 'My Workspace',
            'slug': 'my-workspace-$slugSeed',
            'owner_profile_id': authUser.id,
            'plan': 'starter',
            'is_active': true,
          })
          .select('id')
          .single();

      final workspaceId = workspace['id']?.toString();
      if (workspaceId == null || workspaceId.isEmpty) {
        debugPrint('[WORKSPACE ERROR] Workspace ID missing after create');
        return;
      }

      try {
        await client.from('workspace_members').insert({
          'profile_id': authUser.id,
          'workspace_id': workspaceId,
          'role': 'owner',
          'status': 'active',
          'display_name': authUser.email ?? 'Owner',
        });
      } catch (_) {
        await client.from('workspace_members').insert({
          'user_id': authUser.id,
          'workspace_id': workspaceId,
          'role': 'owner',
          'status': 'active',
          'display_name': authUser.email ?? 'Owner',
        });
      }

      debugPrint('[WORKSPACE CREATE] Created workspace and owner membership');
    } catch (e) {
      // Must not block navigation if bootstrap fails.
      debugPrint('[WORKSPACE ERROR] $e');
    }
  }

  String _friendlyAuthMessage(AuthApiException error) {
    if (error.code == 'invalid_credentials') {
      return 'Wrong email or password';
    }
    return 'Unable to sign in. Please check your credentials.';
  }

  @override
  void dispose() {
    _refreshDebounce?.cancel();
    _dataSubscription?.cancel();
    super.dispose();
  }
}
