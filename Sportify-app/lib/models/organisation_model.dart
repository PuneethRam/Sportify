class Organisation {
  final int orgId;
  final String name;
  final String? createdAt;

  Organisation({required this.orgId, required this.name, this.createdAt});

  factory Organisation.fromJson(Map<String, dynamic> j) => Organisation(
    orgId: _toInt(j['org_id']),
    name: j['name'] ?? '',
    createdAt: j['created_at']?.toString(),
  );
}

class Batch {
  final int clanId;
  final String name;
  final int orgId;
  final String orgName;
  final String? inviteCode;
  final int memberCount;
  final String? role;
  final double attendanceRate;
  final int atRiskCount;
  final int totalSessions;

  Batch({
    required this.clanId,
    required this.name,
    required this.orgId,
    required this.orgName,
    this.inviteCode,
    required this.memberCount,
    this.role,
    this.attendanceRate = 0,
    this.atRiskCount = 0,
    this.totalSessions = 0,
  });

  factory Batch.fromJson(Map<String, dynamic> j) => Batch(
    clanId: _toInt(j['clan_id']),
    name: j['name'] ?? '',
    orgId: _toInt(j['org_id']),
    orgName: j['org_name'] ?? '',
    inviteCode: j['invite_code']?.toString(),
    memberCount: _toInt(j['member_count']),
    role: j['role']?.toString(),
    attendanceRate: _toDouble(j['attendance_rate']),
    atRiskCount: _toInt(j['at_risk_count']),
    totalSessions: _toInt(j['total_sessions']),
  );
}

class AtRiskStudent {
  final String userId;
  final String name;
  final int batchId;
  final String batchName;
  final double rate;

  AtRiskStudent({
    required this.userId,
    required this.name,
    required this.batchId,
    required this.batchName,
    required this.rate,
  });

  factory AtRiskStudent.fromJson(Map<String, dynamic> j) => AtRiskStudent(
    userId: j['user_id']?.toString() ?? '',
    name: j['name'] ?? '',
    batchId: _toInt(j['batch_id']),
    batchName: j['batch_name'] ?? '',
    rate: _toDouble(j['rate']),
  );
}

class TrainingSession {
  final int sessionId;
  final String title;
  final DateTime scheduledAt;
  final int durationMinutes;
  final String orgName;

  TrainingSession({
    required this.sessionId,
    required this.title,
    required this.scheduledAt,
    required this.durationMinutes,
    required this.orgName,
  });

  factory TrainingSession.fromJson(Map<String, dynamic> j) => TrainingSession(
    sessionId: _toInt(j['session_id']),
    title: j['title'] ?? '',
    scheduledAt: DateTime.tryParse(j['scheduled_at']?.toString() ?? '') ??
        DateTime.now().add(const Duration(hours: 1)),
    durationMinutes: _toInt(j['duration_minutes']),
    orgName: j['org_name'] ?? '',
  );
}

int _toInt(dynamic v) {
  if (v == null) return 0;
  if (v is int) return v;
  if (v is double) return v.toInt();
  return int.tryParse(v.toString()) ?? 0;
}

double _toDouble(dynamic v) {
  if (v == null) return 0.0;
  if (v is double) return v;
  if (v is int) return v.toDouble();
  return double.tryParse(v.toString()) ?? 0.0;
}
