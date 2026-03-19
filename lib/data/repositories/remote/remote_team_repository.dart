import '../../../core/network/backend_api_client.dart';
import '../../models/app_user.dart';
import '../team_repository.dart';

class RemoteTeamRepository implements TeamRepository {
  RemoteTeamRepository(this._apiClient);
  final BackendApiClient _apiClient;

  @override
  Future<List<AppUser>> fetchTeam({String? workspaceId}) async {
    final path = workspaceId == null ? '/api/users' : '/api/workspaces/$workspaceId/members';
    final response = await _apiClient.get(path);
    final users = response['users'] ?? response['members'];
    if (users is! List) return [];
    return users
        .whereType<Map<String, dynamic>>()
        .map(AppUser.fromMap)
        .toList();
  }
}
