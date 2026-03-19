class TeamPerformanceMetric {
  const TeamPerformanceMetric({
    required this.memberId,
    required this.memberName,
    required this.assignedLeads,
    required this.contactedLeads,
    required this.qualifiedLeads,
    required this.wonLeads,
    required this.lostLeads,
    required this.followUpsCompleted,
    required this.overdueFollowUps,
    required this.conversationsHandled,
    required this.responseActivityCount,
  });

  final String memberId;
  final String memberName;
  final int assignedLeads;
  final int contactedLeads;
  final int qualifiedLeads;
  final int wonLeads;
  final int lostLeads;
  final int followUpsCompleted;
  final int overdueFollowUps;
  final int conversationsHandled;
  final int responseActivityCount;

  double get conversionRate => assignedLeads == 0 ? 0 : wonLeads / assignedLeads;
}
