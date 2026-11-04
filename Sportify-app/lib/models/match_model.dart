import 'progress_model.dart' show parseRatingChanges;

class ClanMatch {
  final String id;
  final String type;
  final String status;
  final List<String> team1;
  final List<String> team2;
  final List<String> team1Ids;
  final List<String> team2Ids;
  final List<List<int>> scores;
  final String? winner;
  final String? matchDate;
  final String? seriesId;

  /// Glicko-2 rating change per player id, e.g. { uid: 14, uid2: -9 }.
  /// Empty when the match wasn't rated.
  final Map<String, int> ratingChanges;

  /// 'clan_singles' | 'clan_doubles', for POST /api/share { kind: 'match' }.
  final String? source;

  ClanMatch({
    required this.id,
    required this.type,
    required this.status,
    required this.team1,
    required this.team2,
    required this.team1Ids,
    required this.team2Ids,
    required this.scores,
    this.winner,
    this.matchDate,
    this.seriesId,
    this.ratingChanges = const {},
    this.source,
  });

  factory ClanMatch.fromJson(Map<String, dynamic> j) {
    List<String> _names(dynamic v) {
      if (v == null) return [];
      if (v is List) return v.map((e) => e.toString()).toList();
      if (v is String) return v.split(',');
      return [];
    }

    List<List<int>> _parseSetStr(String raw) {
      return raw.split(',').map((set) {
        final parts = set.trim().split('-');
        if (parts.length < 2) return <int>[];
        final a = int.tryParse(parts[0].trim());
        final b = int.tryParse(parts[1].trim());
        if (a == null || b == null) return <int>[];
        return [a, b];
      }).where((s) => s.length == 2).toList();
    }

    List<List<int>> _scores(dynamic v) {
      if (v == null) return [];
      if (v is List) {
        return v.map<List<int>>((s) {
          if (s is List) return s.map<int>((e) => int.tryParse(e.toString()) ?? 0).toList();
          if (s is String) return _parseSetStr(s).firstOrNull ?? [0, 0];
          return [0, 0];
        }).toList();
      }
      if (v is Map) {
        // API format: { team1: [21, 15, 21], team2: [19, 21, 18] }
        final t1 = v['team1'];
        final t2 = v['team2'];
        if (t1 is List && t2 is List && t1.isNotEmpty) {
          final len = t1.length < t2.length ? t1.length : t2.length;
          return List.generate(len, (i) => [
            int.tryParse(t1[i].toString()) ?? 0,
            int.tryParse(t2[i].toString()) ?? 0,
          ]);
        }
        // Fallback: { score: "21-19, 15-21" }
        final scoreStr = v['score']?.toString() ?? '';
        return scoreStr.isEmpty ? [] : _parseSetStr(scoreStr);
      }
      if (v is String && v.isNotEmpty) return _parseSetStr(v);
      return [];
    }

    final players = j['players'] as Map<String, dynamic>?;
    final playerIds = j['playerIds'] as Map<String, dynamic>?;

    return ClanMatch(
      id: j['id']?.toString() ?? '',
      type: j['type'] ?? 'singles',
      status: j['status'] ?? 'upcoming',
      team1: _names(j['team1'] ?? players?['team1']),
      team2: _names(j['team2'] ?? players?['team2']),
      team1Ids: _names(j['team1Ids'] ?? playerIds?['team1']),
      team2Ids: _names(j['team2Ids'] ?? playerIds?['team2']),
      scores: _scores(j['scores'] ?? j['scoreDetails'] ?? j['score_details']),
      winner: j['winner']?.toString(),
      matchDate: j['matchDate']?.toString() ?? j['match_date']?.toString(),
      seriesId: j['seriesId']?.toString(),
      ratingChanges: parseRatingChanges(j['ratingChanges']),
      source: j['source']?.toString(),
    );
  }

  bool get isLive     => status == 'live';
  bool get isUpcoming => status == 'upcoming' || status == 'scheduled';
  bool get isComplete => status == 'completed';

  /// Share source for POST /api/share, falling back on the match type.
  String get shareSource =>
      source ?? (type == 'doubles' ? 'clan_doubles' : 'clan_singles');

  bool get winnerIsTeam1 {
    if (!isComplete || winner == null) return false;
    // Doubles: API returns "team1" / "team2"
    if (winner == 'team1') return true;
    // Singles: API returns the winning player's ID
    return team1Ids.isNotEmpty && team1Ids.contains(winner);
  }

  bool get winnerIsTeam2 {
    if (!isComplete || winner == null) return false;
    if (winner == 'team2') return true;
    return team2Ids.isNotEmpty && team2Ids.contains(winner);
  }
}
