// Phase 2 "habit loop" data: Glicko-2 ratings, weekly streaks, monthly
// seasons and badges. Mirrors Sportify-web lib/ratings.ts (PublicRating),
// lib/streaks.ts, lib/seasons.ts and lib/progress.ts.

/// One format's rating. While [provisional], show "Provisional" instead of
/// the number.
class PublicRating {
  final int rating;
  final int rd;
  final int matches;
  final bool provisional;

  const PublicRating({
    required this.rating,
    required this.rd,
    required this.matches,
    required this.provisional,
  });

  static const unrated =
      PublicRating(rating: 1500, rd: 350, matches: 0, provisional: true);

  factory PublicRating.fromJson(dynamic j) {
    if (j is! Map) return unrated;
    return PublicRating(
      rating: toInt(j['rating']),
      rd: toInt(j['rd']),
      matches: toInt(j['matches']),
      provisional: j['provisional'] == true || j['provisional'] == 1,
    );
  }

  /// "1623" or "Provisional".
  String get label => provisional ? 'Provisional' : '$rating';
}

class Ratings {
  final PublicRating singles;
  final PublicRating doubles;
  const Ratings({required this.singles, required this.doubles});

  factory Ratings.fromJson(dynamic j) => Ratings(
        singles: PublicRating.fromJson(j is Map ? j['singles'] : null),
        doubles: PublicRating.fromJson(j is Map ? j['doubles'] : null),
      );

  /// The format they play most (doubles only if strictly more matches),
  /// as the backend's primaryFormat().
  String get primaryFormat =>
      doubles.matches > singles.matches ? 'doubles' : 'singles';

  PublicRating of(String format) => format == 'doubles' ? doubles : singles;
}

class Streak {
  final int current;
  final int best;
  final bool playedThisWeek;
  const Streak({required this.current, required this.best, required this.playedThisWeek});

  factory Streak.fromJson(dynamic j) => j is Map
      ? Streak(
          current: toInt(j['current']),
          best: toInt(j['best']),
          playedThisWeek: j['playedThisWeek'] == true,
        )
      : const Streak(current: 0, best: 0, playedThisWeek: false);

  /// A running streak that needs a match before Sunday night.
  bool get atRisk => current > 0 && !playedThisWeek;
}

class SeasonBadge {
  final String badge; // champion | top3 | most_matches | biggest_gain
  final String label;
  final int? rank;
  final num? value;
  final String? season;
  final String? seasonName;
  final int? clanId;
  final String? clanName;
  final String? userId;
  final String? name;

  const SeasonBadge({
    required this.badge,
    required this.label,
    this.rank,
    this.value,
    this.season,
    this.seasonName,
    this.clanId,
    this.clanName,
    this.userId,
    this.name,
  });

  factory SeasonBadge.fromJson(Map<String, dynamic> j) => SeasonBadge(
        badge: j['badge']?.toString() ?? '',
        label: j['label']?.toString() ?? badgeLabel(j['badge']?.toString()),
        rank: j['rank'] == null ? null : toInt(j['rank']),
        value: j['value'] is num ? j['value'] as num : num.tryParse('${j['value']}'),
        season: j['season']?.toString(),
        seasonName: j['seasonName']?.toString(),
        clanId: j['clanId'] == null ? null : toInt(j['clanId']),
        clanName: j['clanName']?.toString(),
        userId: j['userId']?.toString(),
        name: j['name']?.toString(),
      );

  static String badgeLabel(String? badge) => switch (badge) {
        'champion' => 'Season champion',
        'top3' => 'Top 3',
        'most_matches' => 'Most matches played',
        'biggest_gain' => 'Biggest rating gain',
        _ => 'Badge',
      };
}

class ClanProgress {
  final int clanId;
  final String name;
  final String? type;
  final int ratingRank;
  final int members;
  final int? seasonRank;
  final num? seasonPoints;
  final int seasonPlayers;

  const ClanProgress({
    required this.clanId,
    required this.name,
    this.type,
    required this.ratingRank,
    required this.members,
    this.seasonRank,
    this.seasonPoints,
    required this.seasonPlayers,
  });

  factory ClanProgress.fromJson(Map<String, dynamic> j) => ClanProgress(
        clanId: toInt(j['clanId']),
        name: j['name']?.toString() ?? '',
        type: j['type']?.toString(),
        ratingRank: toInt(j['ratingRank']),
        members: toInt(j['members']),
        seasonRank: j['seasonRank'] == null ? null : toInt(j['seasonRank']),
        seasonPoints: j['seasonPoints'] is num
            ? j['seasonPoints'] as num
            : num.tryParse('${j['seasonPoints']}'),
        seasonPlayers: toInt(j['seasonPlayers']),
      );
}

/// GET /api/players/progress
class PlayerProgress {
  final String userId;
  final String name;
  final Ratings ratings;
  final String format;
  final Streak streak;
  final List<SeasonBadge> badges;
  final List<ClanProgress> clans;
  final String season;

  const PlayerProgress({
    required this.userId,
    required this.name,
    required this.ratings,
    required this.format,
    required this.streak,
    required this.badges,
    required this.clans,
    required this.season,
  });

  factory PlayerProgress.fromJson(Map<String, dynamic> j) {
    final ratings = Ratings.fromJson(j['ratings']);
    return PlayerProgress(
      userId: j['userId']?.toString() ?? '',
      name: j['name']?.toString() ?? '',
      ratings: ratings,
      format: j['format']?.toString() ?? ratings.primaryFormat,
      streak: Streak.fromJson(j['streak']),
      badges: _list(j['badges']).map(SeasonBadge.fromJson).toList(),
      clans: _list(j['clans']).map(ClanProgress.fromJson).toList(),
      season: j['season']?.toString() ?? '',
    );
  }
}

class SeasonStanding {
  final String userId;
  final String name;
  final int rank;
  final num points;
  final int played;
  final int won;
  final int lost;
  final Ratings? ratings;

  const SeasonStanding({
    required this.userId,
    required this.name,
    required this.rank,
    required this.points,
    required this.played,
    required this.won,
    required this.lost,
    this.ratings,
  });

  factory SeasonStanding.fromJson(Map<String, dynamic> j) => SeasonStanding(
        userId: j['userId']?.toString() ?? '',
        name: j['name']?.toString() ?? 'Player',
        rank: toInt(j['rank']),
        points: j['points'] is num ? j['points'] as num : num.tryParse('${j['points']}') ?? 0,
        played: toInt(j['played']),
        won: toInt(j['won']),
        lost: toInt(j['lost']),
        ratings: j['ratings'] is Map ? Ratings.fromJson(j['ratings']) : null,
      );
}

/// GET /api/clans/season
class SeasonData {
  final String season;
  final String seasonName;
  final bool current;
  final List<SeasonStanding> standings;
  final List<SeasonBadge> badges;

  const SeasonData({
    required this.season,
    required this.seasonName,
    required this.current,
    required this.standings,
    required this.badges,
  });

  factory SeasonData.fromJson(Map<String, dynamic> j) {
    final season = j['season']?.toString() ?? '';
    return SeasonData(
      season: season,
      seasonName: j['seasonName']?.toString() ?? seasonDisplayName(season),
      current: j['current'] == true,
      standings: _list(j['standings']).map(SeasonStanding.fromJson).toList(),
      badges: _list(j['badges']).map(SeasonBadge.fromJson).toList(),
    );
  }

  List<SeasonBadge> badgesFor(String userId) =>
      badges.where((b) => b.userId == userId).toList();
}

// ── Season helpers ───────────────────────────────────────────────────────────

const _months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/// "2026-11" → "November 2026".
String seasonDisplayName(String season) {
  final parts = season.split('-');
  if (parts.length != 2) return season;
  final m = int.tryParse(parts[1]);
  if (m == null || m < 1 || m > 12) return season;
  return '${_months[m - 1]} ${parts[0]}';
}

/// "2026-01" → "2025-12".
String previousSeason(String season) {
  final parts = season.split('-');
  final y = int.tryParse(parts.first) ?? 0;
  final m = parts.length > 1 ? int.tryParse(parts[1]) ?? 1 : 1;
  return m == 1 ? '${y - 1}-12' : '$y-${(m - 1).toString().padLeft(2, '0')}';
}

/// [current] and the [count] - 1 months before it, newest first.
List<String> recentSeasons(String current, {int count = 6}) {
  final out = <String>[];
  var s = current;
  for (var i = 0; i < count; i++) {
    out.add(s);
    s = previousSeason(s);
  }
  return out;
}

// ── Rating change formatting ─────────────────────────────────────────────────

/// "+14", "−9" (true minus sign), "±0".
String formatRatingChange(int delta) {
  if (delta > 0) return '+$delta';
  if (delta < 0) return '−${-delta}';
  return '±0';
}

/// Parses a `{ uid: delta }` map from the API.
Map<String, int> parseRatingChanges(dynamic v) {
  if (v is! Map) return const {};
  return {
    for (final e in v.entries) e.key.toString(): toInt(e.value),
  };
}

List<Map<String, dynamic>> _list(dynamic v) => v is List
    ? v.whereType<Map>().map((e) => e.cast<String, dynamic>()).toList()
    : const [];

int toInt(dynamic v) {
  if (v == null) return 0;
  if (v is int) return v;
  if (v is double) return v.round();
  return int.tryParse(v.toString()) ?? double.tryParse(v.toString())?.round() ?? 0;
}
