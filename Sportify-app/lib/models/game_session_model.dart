class GameSession {
  final int sessionId;
  final String hostName;
  final String title;
  final String sport;
  final String location;
  final DateTime scheduledAt;
  final int maxPlayers;
  final int joinedCount;
  final String skillLevel;
  final String status;
  final String? description;
  final String? hostUserId;

  GameSession({
    required this.sessionId,
    required this.hostName,
    required this.title,
    required this.sport,
    required this.location,
    required this.scheduledAt,
    required this.maxPlayers,
    required this.joinedCount,
    required this.skillLevel,
    required this.status,
    this.description,
    this.hostUserId,
  });

  factory GameSession.fromJson(Map<String, dynamic> j) => GameSession(
    sessionId: _toInt(j['session_id']),
    hostName: j['host_name'] ?? j['creator_name'] ?? 'Host',
    title: j['title'] ?? '',
    sport: j['sport'] ?? 'Other',
    location: j['location'] ?? '',
    scheduledAt: DateTime.tryParse(j['scheduled_at']?.toString() ?? '') ??
        DateTime.now().add(const Duration(hours: 1)),
    maxPlayers: _toInt(j['max_players']),
    joinedCount: _toInt(j['joined_count'] ?? j['current_players']),
    skillLevel: j['skill_level'] ?? 'any',
    status: j['status'] ?? 'open',
    description: j['description']?.toString(),
    hostUserId: j['host_user_id']?.toString(),
  );

  bool get isFull   => joinedCount >= maxPlayers;
  bool get isOpen   => status == 'open' && !isFull;
  int  get spotsLeft => maxPlayers - joinedCount;
}

int _toInt(dynamic v) {
  if (v == null) return 0;
  if (v is int) return v;
  if (v is double) return v.toInt();
  return int.tryParse(v.toString()) ?? 0;
}
