class DashboardLead {
  DashboardLead({
    required this.id,
    required this.name,
    required this.phone,
    required this.status,
    required this.createdAt,
    this.followUpTime,
    this.followUpSent = false,
    this.email,
    this.source,
    this.notes,
    this.messagePreview,
  });

  final String id;
  final String name;
  final String phone;

  /// Pipeline / CRM status: `new` | `contacted` | `follow_up` | `closed`, or legacy temp strings.
  /// Prefer [`stage`] from Supabase when it is a pipeline value so pipeline + dashboard stay aligned.
  final String status;

  final DateTime? createdAt;

  /// When the automated WhatsApp follow-up should fire (`follow_up_time` in DB).
  final DateTime? followUpTime;

  /// Whether the automated follow-up WhatsApp was already sent (`follow_up_sent` in DB).
  final bool followUpSent;

  final String? email;

  /// `source` column (e.g. WHATSAPP, FACEBOOK).
  final String? source;

  /// `notes` column.
  final String? notes;

  /// Latest inquiry from `message` column (optional).
  final String? messagePreview;

  factory DashboardLead.fromRow(Map<String, dynamic> row) {
    final src = (row['source'] ?? '').toString().trim();
    final msg = (row['message'] ?? '').toString().trim();
    return DashboardLead(
      id: (row['id'] ?? '').toString(),
      name: (row['name'] ?? '').toString().trim().isEmpty
          ? 'Unnamed lead'
          : (row['name'] ?? '').toString().trim(),
      phone: (row['phone'] ?? '').toString().trim(),
      status: _statusFromRow(row),
      createdAt: DateTime.tryParse((row['created_at'] ?? '').toString()),
      followUpTime: _parseFollowUpTime(row),
      followUpSent: _parseFollowUpSent(row),
      email: (row['email'] ?? '').toString().trim().isEmpty
          ? null
          : (row['email'] ?? '').toString().trim(),
      source: src.isEmpty ? null : src,
      notes: (row['notes'] ?? '').toString().trim().isEmpty
          ? null
          : (row['notes'] ?? '').toString().trim(),
      messagePreview: msg.isEmpty ? null : msg,
    );
  }

  /// Prefer [`stage`] when it holds a pipeline value; otherwise use [`status`].
  static String _statusFromRow(Map<String, dynamic> row) {
    final stage = (row['stage'] ?? '').toString().trim().toLowerCase();
    final stat = (row['status'] ?? '').toString().trim().toLowerCase();
    const pipeline = {'new', 'contacted', 'follow_up', 'closed'};
    if (pipeline.contains(stage)) {
      return switch (stage) {
        'contacted' => 'contacted',
        'follow_up' => 'follow_up',
        'closed' => 'closed',
        _ => 'new',
      };
    }
    if (stat.isEmpty) return 'new';
    if (pipeline.contains(stat)) {
      return switch (stat) {
        'contacted' => 'contacted',
        'follow_up' => 'follow_up',
        'closed' => 'closed',
        _ => 'new',
      };
    }
    return stat;
  }

  static DateTime? _parseFollowUpTime(Map<String, dynamic> row) {
    final raw = row['follow_up_time'] ?? row['followUpTime'];
    if (raw == null) return null;
    return DateTime.tryParse(raw.toString());
  }

  static bool _parseFollowUpSent(Map<String, dynamic> row) {
    final raw = row['follow_up_sent'] ?? row['followUpSent'];
    if (raw == null) return false;
    if (raw is bool) return raw;
    final s = raw.toString().toLowerCase();
    return s == 'true' || s == '1' || s == 't';
  }
}
