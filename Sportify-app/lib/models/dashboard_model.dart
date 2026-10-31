class DashboardData {
  final String userId;
  final String name;
  final int globalPts;
  final int currentStreak;
  final int bestStreak;
  final int singlesPlayed;
  final int singlesWon;
  final int doublesPlayed;
  final int doublesWon;
  final List<PlayerStat> mostWinsAgainst;
  final List<PlayerStat> mostLossesAgainst;
  final List<UserClan> clans;
  final int tournamentsPlayed;
  final int tournamentsWon;
  final int runnerUp;
  final ClanStats? activeClanStats;

  DashboardData({
    required this.userId,
    required this.name,
    required this.globalPts,
    required this.currentStreak,
    required this.bestStreak,
    required this.singlesPlayed,
    required this.singlesWon,
    required this.doublesPlayed,
    required this.doublesWon,
    required this.mostWinsAgainst,
    required this.mostLossesAgainst,
    required this.clans,
    required this.tournamentsPlayed,
    required this.tournamentsWon,
    required this.runnerUp,
    this.activeClanStats,
  });

  int get totalPlayed => singlesPlayed + doublesPlayed;
  int get totalWon    => singlesWon + doublesWon;
  int get winRate => totalPlayed > 0
      ? ((totalWon / totalPlayed) * 100).round()
      : 0;

  factory DashboardData.fromJson(Map<String, dynamic> j) {
    final stats  = j['stats']  as Map<String, dynamic>? ?? {};
    final gTour  = j['globalTournaments'] as Map<String, dynamic>? ?? {};

    return DashboardData(
      userId: j['user_id']?.toString() ?? '',
      name: j['name'] ?? '',
      globalPts: _toInt(j['global_pts']),
      currentStreak: _toInt(j['currentStreak']),
      bestStreak: _toInt(j['bestStreak']),
      singlesPlayed: _toInt(stats['singles_played']),
      singlesWon: _toInt(stats['singles_won']),
      doublesPlayed: _toInt(stats['doubles_played']),
      doublesWon: _toInt(stats['doubles_won']),
      mostWinsAgainst: (j['mostWinsAgainst'] as List? ?? [])
          .map((e) => PlayerStat.fromJson(e)).toList(),
      mostLossesAgainst: (j['mostLossesAgainst'] as List? ?? [])
          .map((e) => PlayerStat.fromJson(e)).toList(),
      clans: (j['clans'] as List? ?? [])
          .map((e) => UserClan.fromJson(e)).toList(),
      tournamentsPlayed: _toInt(gTour['played']),
      tournamentsWon: _toInt(gTour['won']),
      runnerUp: _toInt(gTour['runner_up']),
      activeClanStats: j['activeClanStats'] != null
          ? ClanStats.fromJson(j['activeClanStats'] as Map<String, dynamic>)
          : null,
    );
  }
}

class PlayerStat {
  final String name;
  final int wins;
  final int losses;
  PlayerStat({required this.name, required this.wins, required this.losses});

  factory PlayerStat.fromJson(Map<String, dynamic> j) => PlayerStat(
    name: j['name'] ?? '',
    wins: _toInt(j['wins']),
    losses: _toInt(j['losses']),
  );
}

class UserClan {
  final String clanId;
  final String name;
  final int clanPoints;
  UserClan({required this.clanId, required this.name, required this.clanPoints});

  factory UserClan.fromJson(Map<String, dynamic> j) => UserClan(
    clanId: j['clan_id']?.toString() ?? '',
    name: j['name'] ?? '',
    clanPoints: _toInt(j['clan_points']),
  );
}

class ClanStats {
  final String clanId;
  final int clanPoints;
  final int singlesPlayed;
  final int singlesWon;
  final int doublesPlayed;
  final int doublesWon;
  final int seriesSinglesPlayed;
  final int seriesSinglesWon;
  final int seriesDoublesPlayed;
  final int seriesDoublesWon;
  final int tournamentsPlayed;
  final int tournamentsWon;
  final int runnerUp;

  ClanStats({
    required this.clanId,
    required this.clanPoints,
    required this.singlesPlayed,
    required this.singlesWon,
    required this.doublesPlayed,
    required this.doublesWon,
    required this.seriesSinglesPlayed,
    required this.seriesSinglesWon,
    required this.seriesDoublesPlayed,
    required this.seriesDoublesWon,
    required this.tournamentsPlayed,
    required this.tournamentsWon,
    required this.runnerUp,
  });

  factory ClanStats.fromJson(Map<String, dynamic> j) => ClanStats(
    clanId: j['clan_id']?.toString() ?? '',
    clanPoints: _toInt(j['clan_points']),
    singlesPlayed: _toInt(j['singles_played']),
    singlesWon: _toInt(j['singles_won']),
    doublesPlayed: _toInt(j['doubles_played']),
    doublesWon: _toInt(j['doubles_won']),
    seriesSinglesPlayed: _toInt(j['series_singles_played']),
    seriesSinglesWon: _toInt(j['series_singles_won']),
    seriesDoublesPlayed: _toInt(j['series_doubles_played']),
    seriesDoublesWon: _toInt(j['series_doubles_won']),
    tournamentsPlayed: _toInt(j['tournaments_played']),
    tournamentsWon: _toInt(j['tournaments_won']),
    runnerUp: _toInt(j['runner_up']),
  );
}

class CoachDashboardData {
  final List<AcademyData> academies;
  final List<AtRiskEntry> atRiskStudents;
  CoachDashboardData({required this.academies, required this.atRiskStudents});

  factory CoachDashboardData.fromJson(Map<String, dynamic> j) =>
      CoachDashboardData(
        academies: (j['academies'] as List? ?? [])
            .map((e) => AcademyData.fromJson(e)).toList(),
        atRiskStudents: (j['atRiskStudents'] as List? ?? [])
            .map((e) => AtRiskEntry.fromJson(e)).toList(),
      );
}

class AcademyData {
  final int orgId;
  final String name;
  final int totalStudents;
  final double avgAttendance;
  final List<BatchData> batches;
  final List<UpcomingSession> upcomingSessions;

  AcademyData({
    required this.orgId,
    required this.name,
    required this.totalStudents,
    required this.avgAttendance,
    required this.batches,
    required this.upcomingSessions,
  });

  factory AcademyData.fromJson(Map<String, dynamic> j) => AcademyData(
    orgId: _toInt(j['org_id']),
    name: j['name'] ?? '',
    totalStudents: _toInt(j['total_students']),
    avgAttendance: _toDouble(j['avg_attendance']),
    batches: (j['batches'] as List? ?? [])
        .map((e) => BatchData.fromJson(e)).toList(),
    upcomingSessions: (j['upcoming_sessions'] as List? ?? [])
        .map((e) => UpcomingSession.fromJson(e)).toList(),
  );
}

class BatchData {
  final int clanId;
  final String name;
  final int memberCount;
  final int totalSessions;
  final double attendanceRate;
  final int atRiskCount;

  BatchData({
    required this.clanId,
    required this.name,
    required this.memberCount,
    required this.totalSessions,
    required this.attendanceRate,
    required this.atRiskCount,
  });

  factory BatchData.fromJson(Map<String, dynamic> j) => BatchData(
    clanId: _toInt(j['clan_id']),
    name: j['name'] ?? '',
    memberCount: _toInt(j['member_count']),
    totalSessions: _toInt(j['total_sessions']),
    attendanceRate: _toDouble(j['attendance_rate']),
    atRiskCount: _toInt(j['at_risk_count']),
  );

  String get healthLabel {
    if (attendanceRate >= 75) return 'Good';
    if (attendanceRate >= 50) return 'Fair';
    return 'Low';
  }
}

class AtRiskEntry {
  final String userId;
  final String name;
  final int batchId;
  final String batchName;
  final double rate;
  AtRiskEntry({
    required this.userId,
    required this.name,
    required this.batchId,
    required this.batchName,
    required this.rate,
  });
  factory AtRiskEntry.fromJson(Map<String, dynamic> j) => AtRiskEntry(
    userId: j['user_id']?.toString() ?? '',
    name: j['name'] ?? '',
    batchId: _toInt(j['batch_id']),
    batchName: j['batch_name'] ?? '',
    rate: _toDouble(j['rate']),
  );
}

class UpcomingSession {
  final int sessionId;
  final String title;
  final DateTime scheduledAt;
  final int durationMinutes;

  UpcomingSession({
    required this.sessionId,
    required this.title,
    required this.scheduledAt,
    required this.durationMinutes,
  });

  factory UpcomingSession.fromJson(Map<String, dynamic> j) => UpcomingSession(
    sessionId: _toInt(j['session_id']),
    title: j['title'] ?? '',
    scheduledAt: DateTime.tryParse(j['scheduled_at']?.toString() ?? '') ??
        DateTime.now().add(const Duration(hours: 1)),
    durationMinutes: _toInt(j['duration_minutes']),
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
