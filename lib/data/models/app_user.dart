enum UserRole { owner, admin, manager, salesperson }

extension UserRoleX on UserRole {
  String get dbValue => switch (this) {
        UserRole.owner => 'owner',
        UserRole.admin => 'admin',
        UserRole.manager => 'manager',
        UserRole.salesperson => 'sales',
      };

  bool get isAdminLike => this == UserRole.owner || this == UserRole.admin || this == UserRole.manager;
}

class AppUser {
  const AppUser({
    required this.id,
    required this.fullName,
    required this.email,
    required this.phone,
    required this.role,
    required this.businessId,
    required this.isActive,
    required this.createdAt,
    this.workspaceId,
    this.membershipStatus,
    this.assignmentCapacity,
  });

  final String id;
  final String fullName;
  final String email;
  final String phone;
  final UserRole role;
  final String businessId;
  final bool isActive;
  final DateTime createdAt;
  final String? workspaceId;
  final String? membershipStatus;
  final int? assignmentCapacity;

  Map<String, dynamic> toMap() => {
        'id': id,
        'fullName': fullName,
        'email': email,
        'phone': phone,
        'role': role.name,
        'businessId': businessId,
        'isActive': isActive,
        'createdAt': createdAt.toIso8601String(),
        'workspaceId': workspaceId,
        'membershipStatus': membershipStatus,
        'assignmentCapacity': assignmentCapacity,
      };

  factory AppUser.fromMap(Map<String, dynamic> map) => AppUser(
        id: map['id'] as String,
        fullName: map['fullName'] as String,
        email: map['email'] as String,
        phone: map['phone'] as String? ?? '',
        role: _roleFromString(map['role']?.toString()),
        businessId: map['businessId'] as String? ?? '',
        isActive: map['isActive'] as bool? ?? true,
        createdAt: DateTime.tryParse(map['createdAt']?.toString() ?? '') ?? DateTime.now(),
        workspaceId: map['workspaceId']?.toString(),
        membershipStatus: map['membershipStatus']?.toString(),
        assignmentCapacity: (map['assignmentCapacity'] as num?)?.toInt(),
      );

  static UserRole _roleFromString(String? value) {
    return switch (value) {
      'owner' => UserRole.owner,
      'admin' => UserRole.admin,
      'manager' => UserRole.manager,
      'sales' || 'salesperson' => UserRole.salesperson,
      _ => UserRole.salesperson,
    };
  }
}
