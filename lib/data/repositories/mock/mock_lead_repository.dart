import 'dart:convert';
import 'dart:async';

import 'package:shared_preferences/shared_preferences.dart';

import '../../models/activity.dart';
import '../../models/follow_up.dart';
import '../../models/lead.dart';
import '../../services/mock_seed_service.dart';
import '../lead_repository.dart';

class MockLeadRepository implements LeadRepository {
  MockLeadRepository();

  static const _leadsKey = 'leadflow_demo_leads_v1';
  static const _activitiesKey = 'leadflow_demo_activities_v1';
  static const _followUpsKey = 'leadflow_demo_followups_v1';

  List<Lead> _leads = [];
  List<Activity> _activities = [];
  List<FollowUp> _followUps = [];
  bool _isInitialized = false;
  final StreamController<void> _changes = StreamController<void>.broadcast();

  @override
  Stream<void> watchDataChanges() => _changes.stream;

  Future<void> _ensureInitialized() async {
    if (_isInitialized) return;
    final prefs = await SharedPreferences.getInstance();
    final leadsJson = prefs.getString(_leadsKey);
    final activitiesJson = prefs.getString(_activitiesKey);
    final followUpsJson = prefs.getString(_followUpsKey);

    if (leadsJson == null || activitiesJson == null || followUpsJson == null) {
      await _seedAndPersist(prefs);
      _isInitialized = true;
      return;
    }

    final decodedLeads = (jsonDecode(leadsJson) as List<dynamic>)
        .map((e) => Lead.fromMap(Map<String, dynamic>.from(e as Map)))
        .toList();
    final decodedActivities = (jsonDecode(activitiesJson) as List<dynamic>)
        .map((e) => Activity.fromMap(Map<String, dynamic>.from(e as Map)))
        .toList();
    final decodedFollowUps = (jsonDecode(followUpsJson) as List<dynamic>)
        .map((e) => FollowUp.fromMap(Map<String, dynamic>.from(e as Map)))
        .toList();

    _leads = decodedLeads;
    _activities = decodedActivities;
    _followUps = decodedFollowUps;
    _isInitialized = true;
  }

  Future<void> _seedAndPersist(SharedPreferences prefs) async {
    _leads = MockSeedService.leads();
    _activities = MockSeedService.activities(_leads);
    _followUps = MockSeedService.followUps(_leads);
    await _persist(prefs);
  }

  Future<void> _persist([SharedPreferences? prefs]) async {
    final sharedPrefs = prefs ?? await SharedPreferences.getInstance();
    await sharedPrefs.setString(
      _leadsKey,
      jsonEncode(_leads.map((e) => e.toMap()).toList()),
    );
    await sharedPrefs.setString(
      _activitiesKey,
      jsonEncode(_activities.map((e) => e.toMap()).toList()),
    );
    await sharedPrefs.setString(
      _followUpsKey,
      jsonEncode(_followUps.map((e) => e.toMap()).toList()),
    );
  }

  @override
  Future<void> addActivity(Activity activity) async {
    await _ensureInitialized();
    _activities = [activity, ..._activities];
    await _persist();
    _changes.add(null);
  }

  @override
  Future<List<Activity>> fetchActivities() async {
    await _ensureInitialized();
    return _activities;
  }

  @override
  Future<List<FollowUp>> fetchFollowUps() async {
    await _ensureInitialized();
    return _followUps;
  }

  @override
  Future<List<Lead>> fetchLeads() async {
    await _ensureInitialized();
    return _leads;
  }

  @override
  Future<Lead> saveLead(Lead lead) async {
    await _ensureInitialized();
    final index = _leads.indexWhere((e) => e.id == lead.id);
    if (index == -1) {
      _leads = [lead, ..._leads];
      await _persist();
      _changes.add(null);
      return lead;
    }
    _leads[index] = lead;
    await _persist();
    _changes.add(null);
    return lead;
  }

  @override
  Future<void> saveFollowUp(FollowUp followUp) async {
    await _ensureInitialized();
    final index = _followUps.indexWhere((e) => e.id == followUp.id);
    if (index == -1) {
      _followUps = [followUp, ..._followUps];
      await _persist();
      _changes.add(null);
      return;
    }
    _followUps[index] = followUp;
    await _persist();
    _changes.add(null);
  }

  @override
  Future<void> resetDemoData() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_leadsKey);
    await prefs.remove(_activitiesKey);
    await prefs.remove(_followUpsKey);
    await _seedAndPersist(prefs);
    _isInitialized = true;
    _changes.add(null);
  }
}
