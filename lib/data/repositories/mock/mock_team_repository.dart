import '../../models/app_user.dart';
import '../../services/mock_seed_service.dart';
import '../team_repository.dart';

class MockTeamRepository implements TeamRepository {
  @override
  Future<List<AppUser>> fetchTeam() async => MockSeedService.users();
}
