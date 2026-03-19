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
    final response = await _apiClient.get('/api/leads');
    final leads = response['leads'];
    if (leads is! List) return [];
    return leads
        .whereType<Map<String, dynamic>>()
        .map(Lead.fromMap)
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
    final map = response['lead'];
    if (map is Map<String, dynamic>) return Lead.fromMap(map);
    return lead;
  }

  @override
  Future<void> saveFollowUp(FollowUp followUp) async {
    await _apiClient.post('/api/followups/upsert', body: followUp.toMap());
  }
}
