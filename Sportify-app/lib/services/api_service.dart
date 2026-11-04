import 'dart:convert';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:http/http.dart' as http;
import '../core/constants.dart';

/// Returns the current user's ID token (null when signed out).
/// [forceRefresh] bypasses the SDK's cached token.
typedef TokenProvider = Future<String?> Function({bool forceRefresh});

/// Returns the signed-in user's uid (null when signed out).
typedef UidProvider = String? Function();

class ApiService {
  ApiService({
    http.Client? client,
    TokenProvider? tokenProvider,
    UidProvider? uidProvider,
  })  : _client = client ?? http.Client(),
        _tokenProvider = tokenProvider ?? _firebaseToken,
        _uidProvider = uidProvider ?? _firebaseUid;

  static final ApiService instance = ApiService();

  final http.Client _client;
  final TokenProvider _tokenProvider;
  final UidProvider _uidProvider;

  // getIdToken() returns the cached token and refreshes it near expiry.
  static Future<String?> _firebaseToken({bool forceRefresh = false}) =>
      FirebaseAuth.instance.currentUser?.getIdToken(forceRefresh) ??
      Future.value(null);

  static String? _firebaseUid() => FirebaseAuth.instance.currentUser?.uid;

  final Map<String, Map<String, dynamic>> _cache = {};
  String? _cacheUid;

  void clearCache() => _cache.clear();

  void invalidate(String pathPrefix) {
    _cache.removeWhere((key, _) => key.contains(pathPrefix));
  }

  /// Drops cached GETs when a different user signs in (or signs out).
  /// Keyed on uid, not token, so routine token refreshes keep the cache.
  String? _syncCacheOwner() {
    final uid = _uidProvider();
    if (uid != _cacheUid) {
      _cache.clear();
      _cacheUid = uid;
    }
    return uid;
  }

  Map<String, String> _headers(String? token) => {
    'Content-Type': 'application/json',
    if (token != null) 'Authorization': 'Bearer $token',
  };

  static const _timeout = Duration(seconds: 15);

  /// Sends a request with a fresh token. On 401, force-refreshes the token
  /// and retries exactly once.
  Future<http.Response> _send(
      Future<http.Response> Function(Map<String, String> headers) request) async {
    final token = await _tokenProvider(forceRefresh: false);
    var res = await _withTimeout(request(_headers(token)));
    if (res.statusCode == 401 && token != null) {
      final fresh = await _tokenProvider(forceRefresh: true);
      if (fresh != null) {
        res = await _withTimeout(request(_headers(fresh)));
      }
    }
    return res;
  }

  Future<http.Response> _withTimeout(Future<http.Response> f) => f.timeout(
      _timeout,
      onTimeout: () => throw ApiException('Request timed out — check API URL ($kApiBase)', 408));

  Future<Map<String, dynamic>> get(String path,
      {Map<String, String>? query, bool cached = true}) async {
    final uid = _syncCacheOwner();
    final uri = Uri.parse('$kApiBase$path')
        .replace(queryParameters: query);
    final cacheKey = uri.toString();

    if (cached && _cache.containsKey(cacheKey)) {
      return _cache[cacheKey]!;
    }

    final res = await _send((h) => _client.get(uri, headers: h));
    final parsed = _parse(res);

    // Skip caching if the user changed while the request was in flight
    if (cached && uid == _uidProvider()) {
      _cache[cacheKey] = parsed;
    }
    return parsed;
  }

  Future<Map<String, dynamic>> post(String path, Map<String, dynamic> body) async {
    _syncCacheOwner();
    final res = await _send((h) => _client.post(
      Uri.parse('$kApiBase$path'),
      headers: h,
      body: jsonEncode(body),
    ));
    final parsed = _parse(res);
    // Invalidate GET cache for related resources after mutation
    _invalidateRelated(path);
    return parsed;
  }

  Future<Map<String, dynamic>> put(String path, Map<String, dynamic> body) async {
    _syncCacheOwner();
    final res = await _send((h) => _client.put(
      Uri.parse('$kApiBase$path'),
      headers: h,
      body: jsonEncode(body),
    ));
    return _parse(res);
  }

  Future<Map<String, dynamic>> patch(String path, Map<String, dynamic> body) async {
    _syncCacheOwner();
    final res = await _send((h) => _client.patch(
      Uri.parse('$kApiBase$path'),
      headers: h,
      body: jsonEncode(body),
    ));
    return _parse(res);
  }

  Future<Map<String, dynamic>> delete(String path, {Map<String, dynamic>? body}) async {
    _syncCacheOwner();
    final res = await _send((h) => _client.delete(
      Uri.parse('$kApiBase$path'),
      headers: h,
      body: body == null ? null : jsonEncode(body),
    ));
    final parsed = _parse(res);
    _invalidateRelated(path);
    return parsed;
  }

  void _invalidateRelated(String path) {
    // Extract the resource group prefix (e.g. /api/clans from /api/clans/series/finish_series)
    final parts = path.split('/').where((p) => p.isNotEmpty).toList();
    // Invalidate any cached GET that shares the same top-level resource group
    if (parts.length >= 2) {
      final prefix = '/${parts[0]}/${parts[1]}';
      _cache.removeWhere((key, _) => key.contains(prefix));
    }
  }

  Map<String, dynamic> _parse(http.Response res) {
    final decoded = jsonDecode(res.body);
    // Some endpoints (clans, leaderboard) return raw arrays — wrap them.
    final body = decoded is List
        ? <String, dynamic>{'data': decoded}
        : decoded as Map<String, dynamic>;
    if (res.statusCode >= 400) {
      throw ApiException(
        body['error']?.toString() ?? 'Request failed',
        res.statusCode,
        body: body,
      );
    }
    return body;
  }

  // ── Phase 2: ratings, bulk entry, seasons, progress, share cards ─────────

  /// Records a coach's batch of results in one go (all or nothing).
  /// Each match: { matchType, player1, player2 | team1Player1..team2Player2,
  /// score }. On a bad row the server answers 400 with `index` (0-based),
  /// available as [ApiException.index].
  Future<Map<String, dynamic>> recordBulkMatches(
          String clanId, List<Map<String, dynamic>> matches) =>
      post('/api/clans/matches/bulk', {'clanId': clanId, 'matches': matches});

  /// A clan's / batch's season standing; [season] is "YYYY-MM" (default:
  /// this month, India time).
  Future<Map<String, dynamic>> getSeason(String clanId, {String? season}) =>
      get('/api/clans/season',
          query: {'clanId': clanId, if (season != null) 'season': season},
          // The current season changes with every result
          cached: false);

  /// Ratings, weekly streak, badges and clan ranks (default: signed-in user).
  Future<Map<String, dynamic>> getProgress({String? userId}) =>
      get('/api/players/progress',
          query: userId == null ? null : {'userId': userId}, cached: false);

  /// Creates (or reuses) a public share link. Returns { url, token, imageUrl }.
  ///   match:   source 'clan_singles' | 'clan_doubles' | 'tournament', matchId
  ///   profile: own profile, optionally in [clanId]
  Future<Map<String, dynamic>> createShareLink({
    required String kind,
    String? source,
    int? matchId,
    int? clanId,
  }) =>
      post('/api/share', {
        'kind': kind,
        if (source != null) 'source': source,
        if (matchId != null) 'matchId': matchId,
        if (clanId != null) 'clanId': clanId,
      });
}

class ApiException implements Exception {
  final String message;
  final int statusCode;

  /// The decoded error response, when there was one.
  final Map<String, dynamic>? body;
  ApiException(this.message, this.statusCode, {this.body});

  /// Row index the server blamed (e.g. bulk match entry), if any.
  int? get index {
    final v = body?['index'];
    return v is int ? v : int.tryParse('${v ?? ''}');
  }

  @override
  String toString() => message;
}
