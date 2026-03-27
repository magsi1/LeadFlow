import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/network/backend_api_client.dart';
import '../../models/activity.dart';
import '../../models/follow_up.dart';
import '../../models/lead.dart';
import '../lead_repository.dart';

class RemoteLeadRepository implements LeadRepository {
  RemoteLeadRepository(this._apiClient);
  final BackendApiClient _apiClient;

  @override
  Stream<void> watchDataChanges() => const Stream.empty();

  @override
  Future<void> addActivity(Activity activity) async {
    await _apiClient.post('/api/activities', body: activity.toMap());
  }

  @override
  Future<List<Activity>> fetchActivities() async {
    final response = await _apiClient.get('/api/activities');
    final items = response['activities'];
    if (items is! List) return [];
    return items
        .whereType<Map<String, dynamic>>()
        .map(Activity.fromMap)
        .toList();
  }

  @override
  Future<List<FollowUp>> fetchFollowUps() async {
    final response = await _apiClient.get('/api/followups');
    final items = response['followups'];
    if (items is! List) return [];
    return items
        .whereType<Map<String, dynamic>>()
        .map(FollowUp.fromMap)
        .toList();
  }

  @override
  Future<List<Lead>> fetchLeads() async {
    final uid = Supabase.instance.client.auth.currentUser?.id;
    if (uid == null || uid.isEmpty) return [];
    final response = await _apiClient.get(
      '/api/leads?user_id=${Uri.encodeQueryComponent(uid)}',
    );
    final leads = LeadflowApiEnvelope.expectDataList(response);
    return leads
        .whereType<Map>()
        .map((e) => Lead.fromLeadflowBackendApiMap(Map<String, dynamic>.from(e)))
        .toList();
  }

  @override
  Future<void> resetDemoData() async {
    // Not applicable for live backend mode.
  }

  @override
  Future<Lead> saveLead(Lead lead) async {
    final body = lead.toMap();
    final response = await _apiClient.post('/api/leads/upsert', body: body);
    if (response['ok'] == true) {
      final data = response['data'];
      if (data is Map) {
        return Lead.fromLeadflowBackendApiMap(Map<String, dynamic>.from(data));
      }
    }
    final legacy = response['lead'];
    if (legacy is Map<String, dynamic>) return Lead.fromMap(legacy);
    return lead;
  }

  @override
  Future<void> saveFollowUp(FollowUp followUp) async {
    await _apiClient.post('/api/followups/upsert', body: followUp.toMap());
  }
}
