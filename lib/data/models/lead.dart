enum LeadStatus {
  leadNew,
  contacted,
  interested,
  followUpNeeded,
  negotiation,
  closedWon,
  closedLost,
}

enum LeadTemperature { hot, warm, cold }

class Lead {
  const Lead({
    required this.id,
    required this.businessId,
    required this.customerName,
    required this.phone,
    this.alternatePhone,
    required this.city,
    required this.address,
    required this.source,
    required this.productInterest,
    required this.budget,
    required this.inquiryText,
    required this.status,
    required this.temperature,
    required this.assignedTo,
    required this.createdBy,
    required this.createdAt,
    required this.updatedAt,
    this.nextFollowUpAt,
    required this.notesSummary,
    required this.isArchived,
    required this.isDeleted,
  });

  final String id;
  final String businessId;
  final String customerName;
  final String phone;
  final String? alternatePhone;
  final String city;
  final String address;
  final String source;
  final String productInterest;
  final String budget;
  final String inquiryText;
  final LeadStatus status;
  final LeadTemperature temperature;
  final String assignedTo;
  final String createdBy;
  final DateTime createdAt;
  final DateTime updatedAt;
  final DateTime? nextFollowUpAt;
  final String notesSummary;
  final bool isArchived;
  final bool isDeleted;

  Lead copyWith({
    String? customerName,
    String? phone,
    String? alternatePhone,
    String? city,
    String? address,
    String? source,
    String? productInterest,
    String? budget,
    String? inquiryText,
    LeadStatus? status,
    LeadTemperature? temperature,
    String? assignedTo,
    DateTime? updatedAt,
    DateTime? nextFollowUpAt,
    String? notesSummary,
  }) {
    return Lead(
      id: id,
      businessId: businessId,
      customerName: customerName ?? this.customerName,
      phone: phone ?? this.phone,
      alternatePhone: alternatePhone ?? this.alternatePhone,
      city: city ?? this.city,
      address: address ?? this.address,
      source: source ?? this.source,
      productInterest: productInterest ?? this.productInterest,
      budget: budget ?? this.budget,
      inquiryText: inquiryText ?? this.inquiryText,
      status: status ?? this.status,
      temperature: temperature ?? this.temperature,
      assignedTo: assignedTo ?? this.assignedTo,
      createdBy: createdBy,
      createdAt: createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      nextFollowUpAt: nextFollowUpAt ?? this.nextFollowUpAt,
      notesSummary: notesSummary ?? this.notesSummary,
      isArchived: isArchived,
      isDeleted: isDeleted,
    );
  }

  Map<String, dynamic> toMap() => {
        'id': id,
        'businessId': businessId,
        'customerName': customerName,
        'phone': phone,
        'alternatePhone': alternatePhone,
        'city': city,
        'address': address,
        'source': source,
        'productInterest': productInterest,
        'budget': budget,
        'inquiryText': inquiryText,
        'status': status.name,
        'temperature': temperature.name,
        'assignedTo': assignedTo,
        'createdBy': createdBy,
        'createdAt': createdAt.toIso8601String(),
        'updatedAt': updatedAt.toIso8601String(),
        'nextFollowUpAt': nextFollowUpAt?.toIso8601String(),
        'notesSummary': notesSummary,
        'isArchived': isArchived,
        'isDeleted': isDeleted,
      };

  factory Lead.fromMap(Map<String, dynamic> map) => Lead(
        id: map['id'] as String,
        businessId: map['businessId'] as String? ?? '',
        customerName: map['customerName'] as String? ?? '',
        phone: map['phone'] as String? ?? '',
        alternatePhone: map['alternatePhone'] as String?,
        city: map['city'] as String? ?? '',
        address: map['address'] as String? ?? '',
        source: map['source'] as String? ?? 'Other',
        productInterest: map['productInterest'] as String? ?? '',
        budget: map['budget'] as String? ?? '',
        inquiryText: map['inquiryText'] as String? ?? '',
        status: LeadStatus.values.firstWhere(
          (e) => e.name == map['status'],
          orElse: () => LeadStatus.leadNew,
        ),
        temperature: LeadTemperature.values.firstWhere(
          (e) => e.name == map['temperature'],
          orElse: () => LeadTemperature.warm,
        ),
        assignedTo: map['assignedTo'] as String? ?? '',
        createdBy: map['createdBy'] as String? ?? '',
        createdAt: DateTime.tryParse(map['createdAt']?.toString() ?? '') ?? DateTime.now(),
        updatedAt: DateTime.tryParse(map['updatedAt']?.toString() ?? '') ?? DateTime.now(),
        nextFollowUpAt: DateTime.tryParse(map['nextFollowUpAt']?.toString() ?? ''),
        notesSummary: map['notesSummary'] as String? ?? '',
        isArchived: map['isArchived'] as bool? ?? false,
        isDeleted: map['isDeleted'] as bool? ?? false,
      );
}
