import '../models/app_user.dart';

abstract class TeamRepository {
  Future<List<AppUser>> fetchTeam();
}
