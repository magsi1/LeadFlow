import '../../models/app_user.dart';
import '../team_repository.dart';

class MockTeamRepository implements TeamRepository {
  @override
  Future<List<AppUser>> fetchTeam({String? workspaceId}) async => const <AppUser>[];
}
