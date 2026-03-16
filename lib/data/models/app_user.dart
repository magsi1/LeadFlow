enum UserRole { admin, salesperson }

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
  });

  final String id;
  final String fullName;
  final String email;
  final String phone;
  final UserRole role;
  final String businessId;
  final bool isActive;
  final DateTime createdAt;

  Map<String, dynamic> toMap() => {
        'id': id,
        'fullName': fullName,
        'email': email,
        'phone': phone,
        'role': role.name,
        'businessId': businessId,
        'isActive': isActive,
        'createdAt': createdAt.toIso8601String(),
      };

  factory AppUser.fromMap(Map<String, dynamic> map) => AppUser(
        id: map['id'] as String,
        fullName: map['fullName'] as String,
        email: map['email'] as String,
        phone: map['phone'] as String? ?? '',
        role: UserRole.values.firstWhere(
          (e) => e.name == map['role'],
          orElse: () => UserRole.salesperson,
        ),
        businessId: map['businessId'] as String? ?? '',
        isActive: map['isActive'] as bool? ?? true,
        createdAt: DateTime.tryParse(map['createdAt']?.toString() ?? '') ?? DateTime.now(),
      );
}
