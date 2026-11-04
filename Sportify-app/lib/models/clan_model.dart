class Clan {
  final String clanId;
  final String name;
  final int clanRank;
  final int? memberCount;
  final String? type;
  final int? orgId;

  Clan({
    required this.clanId,
    required this.name,
    required this.clanRank,
    this.memberCount,
    this.type,
    this.orgId,
  });

  bool get isBatch => type != null && type != 'group';

  factory Clan.fromJson(Map<String, dynamic> j) => Clan(
    clanId: j['clan_id']?.toString() ?? '',
    name: j['name'] ?? '',
    clanRank: _toInt(j['clan_rank']),
    memberCount: j['member_count'] != null ? _toInt(j['member_count']) : null,
    type: j['type']?.toString(),
    orgId: j['org_id'] != null ? _toInt(j['org_id']) : null,
  );
}

class ClanMember {
  final String userId;
  final String name;
  final int clanPoints;
  final int singlesPoints;
  final int doublesPoints;
  final int matchesPlayed;
  final int matchesWon;
  final int matchesLost;
  final int singlesPlayed;
  final int singlesWon;
  final int doublesPlayed;
  final int doublesWon;

  /// Glicko-2 ratings (null if the backend doesn't send them).
  final int? singlesRating;
  final bool singlesProvisional;
  final int singlesRatedMatches;
  final int? doublesRating;
  final bool doublesProvisional;
  final int doublesRatedMatches;

  ClanMember({
    required this.userId,
    required this.name,
    required this.clanPoints,
    required this.singlesPoints,
    required this.doublesPoints,
    required this.matchesPlayed,
    required this.matchesWon,
    required this.matchesLost,
    required this.singlesPlayed,
    required this.singlesWon,
    required this.doublesPlayed,
    required this.doublesWon,
    this.singlesRating,
    this.singlesProvisional = true,
    this.singlesRatedMatches = 0,
    this.doublesRating,
    this.doublesProvisional = true,
    this.doublesRatedMatches = 0,
  });

  bool get hasRatings => singlesRating != null || doublesRating != null;

  int? ratingFor(String format) => format == 'doubles' ? doublesRating : singlesRating;
  bool provisionalFor(String format) =>
      format == 'doubles' ? doublesProvisional : singlesProvisional;
  int ratedMatchesFor(String format) =>
      format == 'doubles' ? doublesRatedMatches : singlesRatedMatches;

  /// Leaderboard order for a format, as the backend's compareByRating():
  /// rated players first (highest rating first), then provisional players.
  static int compareByRating(ClanMember a, ClanMember b, String format) {
    final p = (a.provisionalFor(format) ? 1 : 0) - (b.provisionalFor(format) ? 1 : 0);
    if (p != 0) return p;
    final r = (b.ratingFor(format) ?? 0) - (a.ratingFor(format) ?? 0);
    if (r != 0) return r;
    return b.ratedMatchesFor(format) - a.ratedMatchesFor(format);
  }

  factory ClanMember.fromJson(Map<String, dynamic> j) => ClanMember(
    userId: j['user_id']?.toString() ?? '',
    name: j['name'] ?? '',
    clanPoints: _toInt(j['clan_points']),
    singlesPoints: _toInt(j['singles_points']),
    doublesPoints: _toInt(j['doubles_points']),
    matchesPlayed: _toInt(j['matchesplayed']),
    matchesWon: _toInt(j['matcheswon']),
    matchesLost: _toInt(j['matcheslost']),
    singlesPlayed: _toInt(j['singles_played']),
    singlesWon: _toInt(j['singles_won']),
    doublesPlayed: _toInt(j['doubles_played']),
    doublesWon: _toInt(j['doubles_won']),
    singlesRating: j['singles_rating'] == null ? null : _toInt(j['singles_rating']),
    singlesProvisional: j['singles_provisional'] == null || _isTrue(j['singles_provisional']),
    singlesRatedMatches: _toInt(j['singles_rated_matches']),
    doublesRating: j['doubles_rating'] == null ? null : _toInt(j['doubles_rating']),
    doublesProvisional: j['doubles_provisional'] == null || _isTrue(j['doubles_provisional']),
    doublesRatedMatches: _toInt(j['doubles_rated_matches']),
  );

  int get winRate => matchesPlayed > 0
      ? ((matchesWon / matchesPlayed) * 100).round()
      : 0;
}

bool _isTrue(dynamic v) => v == true || v == 1 || v == '1' || v == 'true';

int _toInt(dynamic v) {
  if (v == null) return 0;
  if (v is int) return v;
  if (v is double) return v.toInt();
  return int.tryParse(v.toString()) ?? 0;
}
