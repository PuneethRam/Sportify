import 'dart:convert';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme.dart';
import '../../services/api_service.dart';
import '../../widgets/loading_screen.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Score helpers
// ─────────────────────────────────────────────────────────────────────────────

Map<String, int> _gamesWon(String? raw) {
  if (raw == null || raw.isEmpty) return {'team1': 0, 'team2': 0};
  try {
    final parsed = jsonDecode(raw) as Map<String, dynamic>;
    final games = (parsed['games'] as List?) ?? [];
    int t1 = 0, t2 = 0;
    for (final g in games) {
      final s1 = (g['team1'] as num?)?.toInt() ?? 0;
      final s2 = (g['team2'] as num?)?.toInt() ?? 0;
      if (s1 > s2) t1++;
      else if (s2 > s1) t2++;
    }
    return {'team1': t1, 'team2': t2};
  } catch (_) {
    return {'team1': 0, 'team2': 0};
  }
}

String _scoreDisplay(String? raw) {
  if (raw == null || raw.isEmpty) return '';
  try {
    final parsed = jsonDecode(raw) as Map<String, dynamic>;
    final games = (parsed['games'] as List?) ?? [];
    return games.map((g) => '${g['team1']}–${g['team2']}').join('  ·  ');
  } catch (_) {
    return '';
  }
}

List<Map<String, int>> _parseScore(String score) {
  return score.split(',').map((part) {
    final nums = part.trim().split('-');
    if (nums.length < 2) return {'team1': 0, 'team2': 0};
    return {
      'team1': int.tryParse(nums[0].trim()) ?? 0,
      'team2': int.tryParse(nums[1].trim()) ?? 0,
    };
  }).toList();
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

class TournamentDetailScreen extends StatefulWidget {
  final String clanId;
  final String tournamentId;
  final String tournamentName;
  final bool isAdmin;

  const TournamentDetailScreen({
    super.key,
    required this.clanId,
    required this.tournamentId,
    required this.tournamentName,
    this.isAdmin = false,
  });

  @override
  State<TournamentDetailScreen> createState() => _TournamentDetailScreenState();
}

class _TournamentDetailScreenState extends State<TournamentDetailScreen> {
  bool _loading = true;
  String? _error;

  Map<String, dynamic>? _tournament;
  List<Map<String, dynamic>> _teams   = [];
  List<Map<String, dynamic>> _matches = [];
  List<Map<String, dynamic>> _groups  = [];

  int  _selectedTab    = 0;
  int? _activeGroupId;
  int  _advancingCount = 2;

  bool _completing     = false;
  bool _generatingKO   = false;
  bool _advancingToKO  = false;
  bool _tabInitialized = false;

  // ── Derived ────────────────────────────────────────────────────────────────

  String get _format => _tournament?['format']?.toString() ?? 'knockout';
  String get _status => _tournament?['status']?.toString() ?? 'upcoming';
  bool   get _isOngoing => _status != 'upcoming' && _status != 'completed' && _status != 'cancelled';
  bool   get _knockoutStarted =>
      _matches.any((m) => m['phase']?.toString() == 'knockout');
  bool   get _allMatchesPlayed =>
      _matches.isNotEmpty && _matches.every((m) => m['winner_team_id'] != null);
  bool get _groupMatchesDone =>
      _format == 'group_knockout' &&
      _matches.any((m) => m['phase']?.toString() != 'knockout') &&
      _matches
          .where((m) => m['phase']?.toString() != 'knockout')
          .every((m) => m['winner_team_id'] != null);

  bool get _allKnockoutMatchesDone {
    final ko = _matches.where((m) => m['phase']?.toString() == 'knockout').toList();
    return ko.isNotEmpty && ko.every((m) => m['winner_team_id'] != null);
  }

  // ── Load ───────────────────────────────────────────────────────────────────

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final data = await ApiService.instance.get(
        '/api/clans/tournaments/get_tournament_details',
        query: {'clanId': widget.clanId, 'tournamentId': widget.tournamentId},
        cached: false,
      );
      if (data['tournament'] == null) throw Exception('Tournament not found');

      final groups = <Map<String, dynamic>>[];
      if (data['groups'] != null) {
        for (final g in data['groups'] as List) {
          groups.add(Map<String, dynamic>.from(g as Map));
        }
      }

      setState(() {
        _tournament = Map<String, dynamic>.from(data['tournament'] as Map);
        _teams      = List<Map<String, dynamic>>.from(data['teams']   ?? []);
        _matches    = List<Map<String, dynamic>>.from(data['matches'] ?? []);
        _groups     = groups;
        if (groups.isNotEmpty && _activeGroupId == null) {
          _activeGroupId = (groups[0]['group_id'] as num?)?.toInt();
        }
        _loading = false;
        if (!_tabInitialized) {
          _tabInitialized = true;
          final fmt = _tournament!['format']?.toString() ?? 'knockout';
          if (fmt == 'knockout') {
            _selectedTab = 2; // Teams=0, Matches=1, Brackets=2
          } else if (fmt == 'group_knockout') {
            _selectedTab = 2; // Teams=0, Matches=1, Groups=2
          } else {
            _selectedTab = 1; // round_robin: Teams=0, Matches=1
          }
        }
      });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  Map<String, dynamic>? _teamById(dynamic id) {
    if (id == null) return null;
    final target = id is int ? id : int.tryParse(id.toString());
    if (target == null) return null;
    for (final t in _teams) {
      final tid = t['team_id'] is int
          ? t['team_id'] as int
          : int.tryParse(t['team_id']?.toString() ?? '');
      if (tid == target) return t;
    }
    return null;
  }

  Map<int, List<Map<String, dynamic>>> _buildRoundsMap(
      List<Map<String, dynamic>> matches) {
    final map = <int, List<Map<String, dynamic>>>{};
    for (final m in matches) {
      final rn = (m['round_number'] as num?)?.toInt() ?? 1;
      map.putIfAbsent(rn, () => []).add(m);
    }
    for (final key in map.keys) {
      map[key]!.sort((a, b) =>
          ((a['match_position'] as num?)?.toInt() ?? 0)
              .compareTo((b['match_position'] as num?)?.toInt() ?? 0));
    }
    return map;
  }

  Set<int> _computeLockedMatchIds() {
    final locked = <int>{};

    // group_knockout: lock all group matches once KO starts
    if (_format == 'group_knockout' && _knockoutStarted) {
      for (final m in _matches) {
        if (m['phase']?.toString() != 'knockout') {
          final id = (m['match_id'] as num?)?.toInt();
          if (id != null) locked.add(id);
        }
      }
    }

    // Bracket: lock a match whose winner is already seeded into next round
    final bracketMatches = _format == 'knockout'
        ? _matches
        : _matches.where((m) => m['phase']?.toString() == 'knockout').toList();

    final roundsMap = _buildRoundsMap(bracketMatches);
    final sortedRounds = roundsMap.keys.toList()..sort();

    for (var ri = 0; ri < sortedRounds.length - 1; ri++) {
      final current = roundsMap[sortedRounds[ri]]!;
      final next    = roundsMap[sortedRounds[ri + 1]]!;
      final teamsInNext = <int>{};
      for (final m in next) {
        final t1 = (m['team1_id'] as num?)?.toInt();
        final t2 = (m['team2_id'] as num?)?.toInt();
        if (t1 != null) teamsInNext.add(t1);
        if (t2 != null) teamsInNext.add(t2);
      }
      for (final m in current) {
        final wId = (m['winner_team_id'] as num?)?.toInt();
        if (wId != null && teamsInNext.contains(wId)) {
          final mId = (m['match_id'] as num?)?.toInt();
          if (mId != null) locked.add(mId);
        }
      }
    }
    return locked;
  }

  List<Map<String, dynamic>> _buildGroupStandings(int groupId) {
    final group = _groups.firstWhere(
        (g) => (g['group_id'] as num?)?.toInt() == groupId,
        orElse: () => {});
    if (group.isEmpty) return [];
    final groupTeams = List<Map<String, dynamic>>.from(group['teams'] ?? []);
    final groupTeamIds = groupTeams
        .map((t) => (t['team_id'] as num?)?.toInt() ?? 0)
        .toSet();
    final groupMatches = _matches.where((m) =>
        m['phase']?.toString() != 'knockout' &&
        groupTeamIds.contains((m['team1_id'] as num?)?.toInt()) &&
        groupTeamIds.contains((m['team2_id'] as num?)?.toInt())).toList();

    final map = <int, Map<String, dynamic>>{};
    for (final t in groupTeams) {
      final tid = (t['team_id'] as num?)?.toInt() ?? 0;
      map[tid] = {
        'team_id': tid,
        'team_name': t['team_name']?.toString() ?? 'Team',
        'played': 0, 'won': 0, 'lost': 0, 'points': 0,
      };
    }
    for (final m in groupMatches) {
      if (m['winner_team_id'] == null) continue;
      int toInt(dynamic v) => v is int ? v : int.tryParse(v.toString()) ?? 0;
      final t1Id = toInt(m['team1_id']);
      final t2Id = toInt(m['team2_id']);
      final wId  = toInt(m['winner_team_id']);
      if (map.containsKey(t1Id)) {
        map[t1Id]!['played'] = (map[t1Id]!['played'] as int) + 1;
        if (wId == t1Id) { map[t1Id]!['won'] = (map[t1Id]!['won'] as int) + 1; map[t1Id]!['points'] = (map[t1Id]!['points'] as int) + 2; }
        else map[t1Id]!['lost'] = (map[t1Id]!['lost'] as int) + 1;
      }
      if (map.containsKey(t2Id)) {
        map[t2Id]!['played'] = (map[t2Id]!['played'] as int) + 1;
        if (wId == t2Id) { map[t2Id]!['won'] = (map[t2Id]!['won'] as int) + 1; map[t2Id]!['points'] = (map[t2Id]!['points'] as int) + 2; }
        else map[t2Id]!['lost'] = (map[t2Id]!['lost'] as int) + 1;
      }
    }
    final list = map.values.toList();
    list.sort((a, b) {
      final pts = (b['points'] as int).compareTo(a['points'] as int);
      if (pts != 0) return pts;
      return (b['won'] as int).compareTo(a['won'] as int);
    });
    return list;
  }

  List<Map<String, dynamic>> _getGroupMatches(int groupId) {
    final group = _groups.firstWhere(
        (g) => (g['group_id'] as num?)?.toInt() == groupId,
        orElse: () => {});
    if (group.isEmpty) return [];
    final groupTeamIds = (group['teams'] as List?)
            ?.map((t) => (t['team_id'] as num?)?.toInt() ?? 0).toSet() ??
        <int>{};
    return _matches.where((m) =>
        m['phase']?.toString() != 'knockout' &&
        groupTeamIds.contains((m['team1_id'] as num?)?.toInt()) &&
        groupTeamIds.contains((m['team2_id'] as num?)?.toInt())).toList();
  }

  // ── Admin actions ──────────────────────────────────────────────────────────

  // There is no "start" action here: clan tournaments are created 'ongoing'
  // with their first-round / round-robin / group matches already generated,
  // and hosted ('open') tournaments are started from the clan screen via
  // start_hosted. Phase transitions are _generateKnockout (group_knockout)
  // and _advanceToKnockout (round_robin).

  Future<void> _completeTournament() async {
    setState(() => _completing = true);
    try {
      await ApiService.instance.post('/api/clans/tournaments/complete_tournament', {
        'clanId': widget.clanId,
        'tournamentId': widget.tournamentId,
      });
      await _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _completing = false);
    }
  }

  Future<void> _generateKnockout() async {
    setState(() => _generatingKO = true);
    try {
      await ApiService.instance.post('/api/clans/tournaments/start_knockout', {
        'clanId': widget.clanId,
        'tournamentId': widget.tournamentId,
      });
      await _load();
      if (mounted) {
        final tabs = _buildTabs();
        final bIdx = tabs.indexOf('Brackets');
        if (bIdx >= 0) setState(() => _selectedTab = bIdx);
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _generatingKO = false);
    }
  }

  Future<void> _advanceToKnockout() async {
    setState(() => _advancingToKO = true);
    try {
      await ApiService.instance.post(
          '/api/clans/tournaments/advance_round_robin_to_knockout', {
        'clanId': widget.clanId,
        'tournamentId': widget.tournamentId,
        'advancingCount': _advancingCount,
      });
      await _load();
      if (mounted) {
        final tabs = _buildTabs();
        final bIdx = tabs.indexOf('Brackets');
        if (bIdx >= 0) setState(() => _selectedTab = bIdx);
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _advancingToKO = false);
    }
  }

  void _showScoreSheet(Map<String, dynamic> match) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: kColorSurface,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _ScoreSheetModal(
        match: match,
        teams: _teams,
        tournamentType:
            _tournament?['tournament_type']?.toString() ?? 'singles',
        clanId: widget.clanId,
        tournamentId: widget.tournamentId,
        onSaved: _load,
      ),
    );
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          title: Text(_tournament?['tournament_name']?.toString() ??
              widget.tournamentName),
          leading: BackButton(onPressed: () => context.pop()),
        ),
        body: _loading
            ? const CenteredLoader()
            : _error != null
                ? ErrorView(message: _error!, onRetry: _load)
                : _buildBody(),
      );

  Widget _buildBody() {
    final locked = _computeLockedMatchIds();
    final tabs   = _buildTabs();
    return Column(children: [
      _buildHeader(),
      if (tabs.length > 1) _buildTabRow(tabs),
      Expanded(child: _buildTabContent(tabs, locked)),
    ]);
  }

  // ── Header ─────────────────────────────────────────────────────────────────

  Widget _buildHeader() {
    final t        = _tournament!;
    final status   = _status;
    final format   = _format;
    final type     = t['tournament_type']?.toString() ?? 'singles';
    final startDate = t['start_date']?.toString();

    Color statusColor;
    String statusLabel;
    if (_isOngoing) { statusColor = kColorPrimary; statusLabel = 'Ongoing'; }
    else if (status == 'completed') { statusColor = kColorMuted; statusLabel = 'Completed'; }
    else { statusColor = kColorAmber; statusLabel = 'Upcoming'; }

    const formatLabels = {
      'knockout': 'Knockout',
      'round_robin': 'Round Robin',
      'group_knockout': 'Group + KO',
    };

    return Container(
      width: double.infinity,
      color: kColorSurface,
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (status == 'completed' && t['winnerTeam'] != null)
          Container(
            width: double.infinity,
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: kColorAmber.withOpacity(0.08),
              borderRadius: BorderRadius.circular(12),
              boxShadow: [BoxShadow(color: kColorAmber.withOpacity(0.15), blurRadius: 8, offset: const Offset(0, 2))],
            ),
            child: Row(children: [
              const Icon(Icons.emoji_events_rounded, color: kColorAmber, size: 22),
              const SizedBox(width: 10),
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Champion', style: TextStyle(color: kColorAmber, fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 1)),
                Text(
                  (t['winnerTeam'] as Map<String, dynamic>?)?['team_name']?.toString() ?? '',
                  style: const TextStyle(color: kColorAmber, fontSize: 15, fontWeight: FontWeight.w800),
                ),
              ]),
            ]),
          ),
        Wrap(spacing: 6, runSpacing: 6, children: [
          _chip(statusLabel, statusColor),
          _chip(formatLabels[format] ?? format, kColorPrimary),
          _chip(type == 'doubles' ? 'Doubles' : 'Singles', kColorMuted),
          if (startDate != null) _chip(_formatDate(startDate), kColorMuted),
          _chip('${_teams.length} teams', kColorMuted),
        ]),
        if (widget.isAdmin && _isOngoing &&
            ((_format == 'knockout' && _allMatchesPlayed) ||
             (_format == 'group_knockout' && _allKnockoutMatchesDone) ||
             (_format == 'round_robin' && _allKnockoutMatchesDone))) ...[
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: _completing ? null : _completeTournament,
              icon: _completing
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, valueColor: AlwaysStoppedAnimation(Colors.white)))
                  : const Icon(Icons.emoji_events_rounded, size: 18),
              label: Text(_completing ? 'Completing…' : 'Declare Champion & Complete'),
              style: ElevatedButton.styleFrom(backgroundColor: kColorAmber),
            ),
          ),
        ],
        if (widget.isAdmin && _isOngoing && _groupMatchesDone && !_knockoutStarted) ...[
          const SizedBox(height: 12),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [kColorPrimary.withOpacity(0.12), kColorEmerald.withOpacity(0.08)]),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: kColorPrimary.withOpacity(0.25)),
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              const Row(children: [
                Icon(Icons.check_circle_rounded, color: kColorEmerald, size: 16),
                SizedBox(width: 6),
                Text('All group matches complete!',
                  style: TextStyle(fontWeight: FontWeight.w800, color: kColorText, fontSize: 13)),
              ]),
              const SizedBox(height: 4),
              Text(
                'Top teams from each group will advance to the knockout stage.',
                style: TextStyle(color: kColorMuted.withOpacity(0.8), fontSize: 11),
              ),
              const SizedBox(height: 10),
              ElevatedButton.icon(
                onPressed: _generatingKO ? null : _generateKnockout,
                icon: _generatingKO
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, valueColor: AlwaysStoppedAnimation(Colors.white)))
                    : const Icon(Icons.account_tree_rounded, size: 18),
                label: Text(_generatingKO ? 'Generating Bracket…' : 'Generate Knockout Bracket'),
                style: ElevatedButton.styleFrom(backgroundColor: kColorPrimary),
              ),
            ]),
          ),
        ],
      ]),
    );
  }

  Widget _chip(String label, Color color) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: color.withOpacity(0.1),
          borderRadius: BorderRadius.circular(6),
        ),
        child: Text(label,
            style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w700)),
      );

  String _formatDate(String raw) {
    try {
      final dt = DateTime.parse(raw);
      return '${dt.day}/${dt.month}/${dt.year}';
    } catch (_) {
      return raw.length > 10 ? raw.substring(0, 10) : raw;
    }
  }

  // ── Tabs ───────────────────────────────────────────────────────────────────

  List<String> _buildTabs() {
    final tabs = <String>['Teams', 'Matches'];
    if (_format == 'knockout') {
      tabs.add('Brackets');
    } else if (_format == 'round_robin') {
      tabs.add('Standings');
      if (_knockoutStarted) tabs.add('Brackets');
    } else if (_format == 'group_knockout') {
      tabs.add('Groups');
      if (_knockoutStarted) tabs.add('Brackets');
    }
    return tabs;
  }

  Widget _buildTabRow(List<String> tabs) {
    return Container(
      color: kColorSurface,
      child: Column(children: [
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Row(
            children: tabs.asMap().entries.map((e) {
              final selected = e.key == _selectedTab;
              return GestureDetector(
                onTap: () => setState(() => _selectedTab = e.key),
                child: Container(
                  margin: const EdgeInsets.only(right: 6),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                  decoration: BoxDecoration(
                    color: selected ? kColorPrimary : kColorPrimary.withOpacity(0.08),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(e.value,
                      style: TextStyle(
                          color: selected ? kColorSurface : kColorPrimary,
                          fontSize: 13,
                          fontWeight: FontWeight.w600)),
                ),
              );
            }).toList(),
          ),
        ),
        const Divider(height: 1),
      ]),
    );
  }

  Widget _buildTabContent(List<String> tabs, Set<int> locked) {
    if (tabs.isEmpty || _selectedTab >= tabs.length) return const CenteredLoader();
    switch (tabs[_selectedTab]) {
      case 'Teams':    return _buildTeamsTab();
      case 'Matches':  return _buildMatchesTab(locked);
      case 'Standings': return _buildStandingsTab();
      case 'Groups':   return _buildGroupsTab(locked);
      case 'Brackets': return _buildBracketsTab(locked);
      default:         return const SizedBox();
    }
  }

  // ── Teams Tab ──────────────────────────────────────────────────────────────

  Widget _buildTeamsTab() {
    if (_teams.isEmpty) {
      return const EmptyView(message: 'No teams registered yet', icon: Icons.group_outlined);
    }
    final winnerId = (() {
      final raw = _tournament?['winner_team_id'];
      if (raw == null) return null;
      return raw is int ? raw : int.tryParse(raw.toString());
    })();

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _teams.length,
      itemBuilder: (_, i) {
        final team   = _teams[i];
        final teamId = team['team_id'] is int
            ? team['team_id'] as int
            : int.tryParse(team['team_id']?.toString() ?? '');
        final isWinner = winnerId != null && teamId == winnerId;
        final teamName = team['team_name']?.toString() ?? 'Team';

        List<dynamic> players = [];
        final rawP = team['players'];
        if (rawP is List) players = rawP;
        else if (rawP is String && rawP.isNotEmpty) {
          try { players = jsonDecode(rawP) as List; } catch (_) {}
        }
        final detailPlayers = team['playersDetails'];
        if (detailPlayers is List && detailPlayers.isNotEmpty) {
          players = detailPlayers;
        }

        return Container(
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: kColorSurface,
            borderRadius: BorderRadius.circular(14),
            boxShadow: [
              BoxShadow(
                color: isWinner ? kColorAmber.withOpacity(0.15) : const Color(0x0A000000),
                blurRadius: 8, offset: const Offset(0, 2)),
            ],
          ),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
              width: 36, height: 36,
              decoration: BoxDecoration(
                color: isWinner ? kColorAmber.withOpacity(0.12) : kColorPrimary.withOpacity(0.1),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Center(child: Text(
                teamName[0].toUpperCase(),
                style: TextStyle(color: isWinner ? kColorAmber : kColorPrimary, fontWeight: FontWeight.w800, fontSize: 15),
              )),
            ),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(child: Text(teamName, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: kColorText))),
                if (isWinner) const Icon(Icons.emoji_events_rounded, color: kColorAmber, size: 18),
              ]),
              if (isWinner) const Text('Champion', style: TextStyle(color: kColorAmber, fontSize: 11, fontWeight: FontWeight.w600)),
              if (players.isNotEmpty) ...[
                const SizedBox(height: 6),
                Wrap(spacing: 4, runSpacing: 4, children: players.map((p) {
                  final pName = p is Map
                      ? (p['name']?.toString() ?? p['user_id']?.toString() ?? '')
                      : p.toString();
                  if (pName.isEmpty) return const SizedBox.shrink();
                  return Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: kColorPrimary.withOpacity(0.08),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(pName, style: const TextStyle(color: kColorPrimary, fontSize: 11, fontWeight: FontWeight.w500)),
                  );
                }).toList()),
              ],
            ])),
          ]),
        );
      },
    );
  }

  // ── Matches Tab ────────────────────────────────────────────────────────────

  Widget _buildMatchesTab(Set<int> locked) {
    final roundsMap = _buildRoundsMap(_matches);
    if (roundsMap.isEmpty) {
      return const EmptyView(
        message: 'No matches yet',
        icon: Icons.sports_rounded,
      );
    }
    final sortedRounds = roundsMap.keys.toList()..sort();
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: sortedRounds.length,
      itemBuilder: (_, i) {
        final rn      = sortedRounds[i];
        final rMatches = roundsMap[rn]!;
        final played  = rMatches.where((m) => m['winner_team_id'] != null).length;
        return _buildRoundSection(rn, rMatches, played, locked);
      },
    );
  }

  Widget _buildRoundSection(int round, List<Map<String, dynamic>> matches,
      int played, Set<int> locked) {
    final allDone = played == matches.length;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Text('Round $round', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: kColorMuted, letterSpacing: 0.5)),
        const SizedBox(width: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
          decoration: BoxDecoration(
            color: allDone ? kColorEmerald.withOpacity(0.1) : kColorAmber.withOpacity(0.1),
            borderRadius: BorderRadius.circular(6),
          ),
          child: Text(
            allDone ? 'Complete' : '$played/${matches.length} played',
            style: TextStyle(color: allDone ? kColorEmerald : kColorAmber, fontSize: 10, fontWeight: FontWeight.w700),
          ),
        ),
      ]),
      const SizedBox(height: 8),
      ...matches.map((m) => _buildMatchCard(m, locked)),
      const SizedBox(height: 20),
    ]);
  }

  Widget _buildMatchCard(Map<String, dynamic> match, Set<int> locked) {
    final team1   = _teamById(match['team1_id']);
    final team2   = _teamById(match['team2_id']);
    final t1Name  = team1?['team_name']?.toString() ?? 'TBD';
    final t2Name  = team2?['team_name']?.toString() ?? 'TBD';
    final done    = match['winner_team_id'] != null;
    final wId     = match['winner_team_id'];
    final t1Id    = match['team1_id'];
    final t2Id    = match['team2_id'];
    final mId     = (match['match_id'] as num?)?.toInt();

    bool sameId(dynamic a, dynamic b) {
      if (a == null || b == null) return false;
      final ia = a is int ? a : int.tryParse(a.toString());
      final ib = b is int ? b : int.tryParse(b.toString());
      return ia != null && ib != null && ia == ib;
    }

    final t1Win   = done && sameId(wId, t1Id);
    final t2Win   = done && sameId(wId, t2Id);
    final wins    = _gamesWon(match['score_details']?.toString());
    final scoreStr = _scoreDisplay(match['score_details']?.toString());
    final isLocked = mId != null && locked.contains(mId);
    final canEdit = widget.isAdmin && _isOngoing && !isLocked;

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: const BoxDecoration(
        color: kColorSurface,
        borderRadius: BorderRadius.all(Radius.circular(14)),
        boxShadow: [
          BoxShadow(color: Color(0x0A000000), blurRadius: 8, offset: Offset(0, 2)),
          BoxShadow(color: Color(0x04000000), blurRadius: 2),
        ],
      ),
      child: Column(children: [
        Container(
          height: 3,
          decoration: BoxDecoration(
            gradient: LinearGradient(colors: done
                ? [kColorEmerald, kColorEmerald.withOpacity(0.5)]
                : [kColorPrimary, kColorPrimary.withOpacity(0.4)]),
            borderRadius: const BorderRadius.vertical(top: Radius.circular(14)),
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(12),
          child: Column(children: [
            _buildTeamRow(name: t1Name, isWinner: t1Win, gamesWon: done ? wins['team1'] : null),
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(children: [
                Expanded(child: Divider(color: const Color(0x18000000), height: 1)),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  child: Text('VS', style: TextStyle(fontSize: 9, fontWeight: FontWeight.w900, color: kColorMuted.withOpacity(0.5), letterSpacing: 1.5)),
                ),
                Expanded(child: Divider(color: const Color(0x18000000), height: 1)),
              ]),
            ),
            _buildTeamRow(name: t2Name, isWinner: t2Win, gamesWon: done ? wins['team2'] : null),
            const SizedBox(height: 10),
            Row(children: [
              Expanded(child: Text(
                scoreStr.isNotEmpty ? scoreStr : 'Not played yet',
                style: TextStyle(color: scoreStr.isNotEmpty ? kColorMuted : kColorMuted.withOpacity(0.5), fontSize: 11),
              )),
              if (isLocked)
                Row(mainAxisSize: MainAxisSize.min, children: const [
                  Icon(Icons.lock_outline_rounded, size: 13, color: kColorMuted),
                  SizedBox(width: 3),
                  Text('Locked', style: TextStyle(color: kColorMuted, fontSize: 11)),
                ])
              else if (canEdit)
                GestureDetector(
                  onTap: () => _showScoreSheet(match),
                  child: Text(done ? 'Edit' : 'Score',
                      style: const TextStyle(color: kColorPrimary, fontSize: 12, fontWeight: FontWeight.w700)),
                ),
            ]),
          ]),
        ),
      ]),
    );
  }

  Widget _buildTeamRow({required String name, required bool isWinner, int? gamesWon}) =>
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          color: isWinner ? kColorEmerald.withOpacity(0.07) : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(children: [
          if (isWinner) ...[
            const Icon(Icons.emoji_events_rounded, color: kColorEmerald, size: 14),
            const SizedBox(width: 6),
          ],
          Expanded(child: Text(name,
              style: TextStyle(
                  fontWeight: isWinner ? FontWeight.w700 : FontWeight.w500,
                  fontSize: 13,
                  color: isWinner ? kColorEmerald : kColorText))),
          if (gamesWon != null)
            Text('$gamesWon',
                style: TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 16,
                    color: isWinner ? kColorEmerald : kColorMuted)),
        ]),
      );

  // ── Standings Tab ──────────────────────────────────────────────────────────

  Widget _buildStandingsTab() {
    final standings = _calcStandings();
    if (standings.isEmpty) {
      return const EmptyView(message: 'No standings yet', icon: Icons.table_chart_outlined);
    }
    final rrDone = _format == 'round_robin' &&
        _matches.isNotEmpty &&
        _matches.every((m) => m['winner_team_id'] != null);

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _buildStandingsTable(standings),
        if (widget.isAdmin && rrDone && !_knockoutStarted && _status != 'completed') ...[
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: kColorPrimary.withOpacity(0.04),
              borderRadius: BorderRadius.circular(14),
              boxShadow: [BoxShadow(color: kColorPrimary.withOpacity(0.08), blurRadius: 8, offset: const Offset(0, 2))],
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              const Text('All round-robin matches complete — choose how to finish:',
                  style: TextStyle(fontWeight: FontWeight.w700, color: kColorText, fontSize: 13)),
              const SizedBox(height: 12),
              ElevatedButton.icon(
                onPressed: _completing ? null : _completeTournament,
                icon: _completing
                    ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, valueColor: AlwaysStoppedAnimation(Colors.white)))
                    : const Icon(Icons.emoji_events_rounded, size: 16),
                label: Text(_completing ? 'Completing…' : 'Complete (Winner = #1)'),
                style: ElevatedButton.styleFrom(backgroundColor: kColorAmber),
              ),
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: kColorSurface,
                  borderRadius: BorderRadius.circular(10),
                  boxShadow: const [BoxShadow(color: Color(0x08000000), blurRadius: 4)],
                ),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Row(children: [
                    const Text('Advance top ', style: TextStyle(color: kColorText, fontSize: 13)),
                    const SizedBox(width: 8),
                    DropdownButton<int>(
                      value: _advancingCount,
                      isDense: true,
                      underline: const SizedBox(),
                      style: const TextStyle(color: kColorPrimary, fontWeight: FontWeight.w700, fontSize: 14),
                      dropdownColor: kColorSurface,
                      items: [2, 4, 8, 16]
                          .where((n) => n <= _teams.length)
                          .map((n) => DropdownMenuItem(value: n, child: Text('$n', style: const TextStyle(color: kColorPrimary, fontWeight: FontWeight.w700))))
                          .toList(),
                      onChanged: (v) { if (v != null) setState(() => _advancingCount = v); },
                    ),
                    const Text(' to knockout', style: TextStyle(color: kColorText, fontSize: 13)),
                  ]),
                  const SizedBox(height: 8),
                  ElevatedButton(
                    onPressed: _advancingToKO ? null : _advanceToKnockout,
                    child: _advancingToKO
                        ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, valueColor: AlwaysStoppedAnimation(Colors.white)))
                        : const Text('Generate Knockout →'),
                  ),
                  const SizedBox(height: 6),
                  const Text('Seeds #1 vs last, #2 vs second-last, etc.',
                      style: TextStyle(color: kColorMuted, fontSize: 11)),
                ]),
              ),
            ]),
          ),
        ],
        if (_knockoutStarted && _status != 'completed') ...[
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: kColorPrimary.withOpacity(0.06),
              borderRadius: BorderRadius.circular(12),
              boxShadow: [BoxShadow(color: kColorPrimary.withOpacity(0.08), blurRadius: 6, offset: const Offset(0, 2))],
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Knockout bracket is in progress.', style: TextStyle(fontWeight: FontWeight.w700, color: kColorPrimary, fontSize: 13)),
              const SizedBox(height: 4),
              const Text('Complete all knockout matches, then use the Brackets tab to finish.',
                  style: TextStyle(color: kColorMuted, fontSize: 12)),
            ]),
          ),
        ],
      ],
    );
  }

  List<Map<String, dynamic>> _calcStandings() {
    final matchSource = _format == 'group_knockout'
        ? _matches.where((m) => m['phase']?.toString() != 'knockout').toList()
        : _matches;
    final map = <int, Map<String, dynamic>>{};
    for (final team in _teams) {
      final id = team['team_id'] is int
          ? team['team_id'] as int
          : int.tryParse(team['team_id']?.toString() ?? '') ?? 0;
      map[id] = {'team_id': id, 'team_name': team['team_name']?.toString() ?? 'Team',
          'played': 0, 'won': 0, 'lost': 0, 'points': 0};
    }
    for (final m in matchSource) {
      if (m['winner_team_id'] == null) continue;
      int toInt(dynamic v) => v is int ? v : int.tryParse(v.toString()) ?? 0;
      final t1Id = toInt(m['team1_id']);
      final t2Id = toInt(m['team2_id']);
      final wId  = toInt(m['winner_team_id']);
      if (map.containsKey(t1Id)) {
        map[t1Id]!['played'] = (map[t1Id]!['played'] as int) + 1;
        if (wId == t1Id) { map[t1Id]!['won'] = (map[t1Id]!['won'] as int) + 1; map[t1Id]!['points'] = (map[t1Id]!['points'] as int) + 2; }
        else map[t1Id]!['lost'] = (map[t1Id]!['lost'] as int) + 1;
      }
      if (map.containsKey(t2Id)) {
        map[t2Id]!['played'] = (map[t2Id]!['played'] as int) + 1;
        if (wId == t2Id) { map[t2Id]!['won'] = (map[t2Id]!['won'] as int) + 1; map[t2Id]!['points'] = (map[t2Id]!['points'] as int) + 2; }
        else map[t2Id]!['lost'] = (map[t2Id]!['lost'] as int) + 1;
      }
    }
    final list = map.values.toList();
    list.sort((a, b) {
      final pts = (b['points'] as int).compareTo(a['points'] as int);
      if (pts != 0) return pts;
      return (b['won'] as int).compareTo(a['won'] as int);
    });
    return list;
  }

  Widget _buildStandingsTable(List<Map<String, dynamic>> standings) {
    if (standings.isEmpty) return const SizedBox.shrink();
    return Column(children: [
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(color: kColorPrimary.withOpacity(0.05), borderRadius: BorderRadius.circular(10)),
        child: const Row(children: [
          SizedBox(width: 28),
          Expanded(child: Text('Team', style: TextStyle(color: kColorMuted, fontSize: 11, fontWeight: FontWeight.w700))),
          SizedBox(width: 30, child: Center(child: Text('P', style: TextStyle(color: kColorMuted, fontSize: 11, fontWeight: FontWeight.w700)))),
          SizedBox(width: 30, child: Center(child: Text('W', style: TextStyle(color: kColorEmerald, fontSize: 11, fontWeight: FontWeight.w700)))),
          SizedBox(width: 30, child: Center(child: Text('L', style: TextStyle(color: kColorRose, fontSize: 11, fontWeight: FontWeight.w700)))),
          SizedBox(width: 36, child: Center(child: Text('PTS', style: TextStyle(color: kColorAmber, fontSize: 11, fontWeight: FontWeight.w700)))),
        ]),
      ),
      const SizedBox(height: 4),
      ...standings.asMap().entries.map((e) {
        final rank = e.key;
        final s    = e.value;
        final Color rankColor;
        if (rank == 0) rankColor = kColorAmber;
        else if (rank == 1) rankColor = kColorMuted;
        else if (rank == 2) rankColor = kColorRose;
        else rankColor = kColorMuted.withOpacity(0.5);
        return Container(
          margin: const EdgeInsets.only(top: 4),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: rank == 0 ? kColorAmber.withOpacity(0.04) : kColorSurface,
            borderRadius: BorderRadius.circular(10),
            boxShadow: [BoxShadow(color: rank == 0 ? kColorAmber.withOpacity(0.12) : const Color(0x08000000), blurRadius: 6, offset: const Offset(0, 1))],
          ),
          child: Row(children: [
            Container(width: 22, height: 22,
              decoration: BoxDecoration(color: rankColor.withOpacity(0.12), shape: BoxShape.circle),
              child: Center(child: Text('${rank + 1}', style: TextStyle(color: rankColor, fontSize: 11, fontWeight: FontWeight.w800)))),
            const SizedBox(width: 8),
            Expanded(child: Text(s['team_name']?.toString() ?? 'Team',
              style: const TextStyle(color: kColorText, fontSize: 13, fontWeight: FontWeight.w600))),
            SizedBox(width: 30, child: Center(child: Text('${s['played']}', style: const TextStyle(color: kColorMuted, fontSize: 13)))),
            SizedBox(width: 30, child: Center(child: Text('${s['won']}', style: const TextStyle(color: kColorEmerald, fontSize: 13, fontWeight: FontWeight.w700)))),
            SizedBox(width: 30, child: Center(child: Text('${s['lost']}', style: const TextStyle(color: kColorRose, fontSize: 13)))),
            SizedBox(width: 36, child: Center(child: Text('${s['points']}', style: const TextStyle(color: kColorAmber, fontSize: 15, fontWeight: FontWeight.w800)))),
          ]),
        );
      }),
    ]);
  }

  // ── Groups Tab ─────────────────────────────────────────────────────────────

  Widget _buildGroupsTab(Set<int> locked) {
    if (_groups.isEmpty) {
      return const EmptyView(message: 'No group data', icon: Icons.group_work_outlined);
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Info chip when knockout is already active
        if (_knockoutStarted) ...[
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            margin: const EdgeInsets.only(bottom: 16),
            decoration: BoxDecoration(
              color: kColorEmerald.withOpacity(0.07),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: kColorEmerald.withOpacity(0.25)),
            ),
            child: Row(children: [
              const Icon(Icons.account_tree_rounded, color: kColorEmerald, size: 16),
              const SizedBox(width: 8),
              const Expanded(child: Text('Knockout bracket is active — see the Brackets tab.',
                style: TextStyle(color: kColorEmerald, fontWeight: FontWeight.w600, fontSize: 12))),
            ]),
          ),
        ],

        // ── Group selector chips ───────────────────────────────────────────
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: _groups.map((g) {
              final gId      = (g['group_id'] as num?)?.toInt();
              final isActive = gId == _activeGroupId;
              return GestureDetector(
                onTap: () => setState(() => _activeGroupId = gId),
                child: Container(
                  margin: const EdgeInsets.only(right: 6),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  decoration: BoxDecoration(
                    color: isActive ? kColorPrimary : kColorPrimary.withOpacity(0.08),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(g['group_name']?.toString() ?? 'Group',
                    style: TextStyle(color: isActive ? Colors.white : kColorPrimary, fontWeight: FontWeight.w700, fontSize: 13)),
                ),
              );
            }).toList(),
          ),
        ),
        const SizedBox(height: 16),
        if (_activeGroupId != null) ...[
          const Text('STANDINGS', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: kColorMuted, letterSpacing: 1)),
          const SizedBox(height: 8),
          _buildStandingsTable(_buildGroupStandings(_activeGroupId!)),
          const SizedBox(height: 20),
          const Text('GROUP MATCHES', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: kColorMuted, letterSpacing: 1)),
          const SizedBox(height: 8),
          ..._buildGroupMatchWidgets(_activeGroupId!, locked),
        ],
      ],
    );
  }

  List<Widget> _buildGroupMatchWidgets(int groupId, Set<int> locked) {
    final gMatches = _getGroupMatches(groupId);
    if (gMatches.isEmpty) {
      return [const EmptyView(message: 'No matches in this group yet', icon: Icons.sports_rounded)];
    }
    final roundsMap    = _buildRoundsMap(gMatches);
    final sortedRounds = roundsMap.keys.toList()..sort();
    final result       = <Widget>[];
    for (final rn in sortedRounds) {
      final rMatches = roundsMap[rn]!;
      final played   = rMatches.where((m) => m['winner_team_id'] != null).length;
      result.add(_buildRoundSection(rn, rMatches, played, locked));
    }
    return result;
  }

  // ── Brackets Tab (visual) ──────────────────────────────────────────────────

  Widget _buildBracketsTab(Set<int> locked) {
    const cardH      = 104.0;
    const baseSlotH  = 140.0;
    const connectorW = 36.0;
    const roundW     = 200.0;
    const headerH    = 36.0;

    final bracketMatches = _format == 'knockout'
        ? _matches
        : _matches.where((m) => m['phase']?.toString() == 'knockout').toList();

    if (bracketMatches.isEmpty) {
      return EmptyView(
        message: _format == 'group_knockout'
            ? (_groupMatchesDone
                ? 'Knockout bracket not generated yet'
                : 'Complete all group matches first, then generate the knockout bracket.')
            : 'Knockout bracket not generated yet',
        icon: Icons.account_tree_outlined,
        action: widget.isAdmin && _isOngoing &&
                _format == 'group_knockout' && _groupMatchesDone
            ? ElevatedButton.icon(
                onPressed: _generatingKO ? null : _generateKnockout,
                icon: _generatingKO
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, valueColor: AlwaysStoppedAnimation(Colors.white)))
                    : const Icon(Icons.account_tree_rounded, size: 18),
                label: Text(_generatingKO ? 'Generating…' : 'Generate Knockout Bracket'),
                style: ElevatedButton.styleFrom(backgroundColor: kColorPrimary),
              )
            : null,
      );
    }

    final roundsMap    = _buildRoundsMap(bracketMatches);
    final sortedRounds = roundsMap.keys.toList()..sort();
    final round1Count  = roundsMap[sortedRounds[0]]!.length;
    final totalH       = round1Count * baseSlotH;
    final expectedTotal = (log(2 * round1Count) / log(2)).ceil();

    String roundLabel(int ri) {
      final fromEnd = expectedTotal - 1 - ri;
      if (fromEnd == 0) return 'FINAL';
      if (fromEnd == 1) return 'SEMI-FINALS';
      if (fromEnd == 2) return 'QUARTER-FINALS';
      return 'ROUND ${ri + 1}';
    }

    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.all(16),
            child: SizedBox(
              height: headerH + totalH + 8,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (var ri = 0; ri < sortedRounds.length; ri++) ...[
                    SizedBox(
                      width: roundW,
                      child: Column(children: [
                        Container(
                          height: headerH,
                          alignment: Alignment.center,
                          margin: const EdgeInsets.only(bottom: 4),
                          decoration: BoxDecoration(
                            gradient: const LinearGradient(colors: [kColorPrimary, kColorEmerald]),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(roundLabel(ri),
                            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 9, letterSpacing: 1.2)),
                        ),
                        SizedBox(
                          height: totalH,
                          child: Stack(
                            clipBehavior: Clip.none,
                            children: [
                              for (var mi = 0; mi < roundsMap[sortedRounds[ri]]!.length; mi++)
                                _buildBracketCard(
                                  match: roundsMap[sortedRounds[ri]]![mi],
                                  top: mi * baseSlotH * pow(2, ri) + (baseSlotH * pow(2, ri) - cardH) / 2,
                                  width: roundW,
                                  cardH: cardH,
                                  locked: locked,
                                ),
                            ],
                          ),
                        ),
                      ]),
                    ),
                    if (ri < sortedRounds.length - 1)
                      SizedBox(
                        width: connectorW,
                        child: Column(children: [
                          SizedBox(height: headerH + 4),
                          SizedBox(
                            height: totalH,
                            child: Stack(
                              children: [
                                for (var mi = 0; mi < roundsMap[sortedRounds[ri]]!.length; mi += 2) ...[
                                  if (mi + 1 < roundsMap[sortedRounds[ri]]!.length)
                                    Positioned(
                                      top: mi * baseSlotH * pow(2, ri) + baseSlotH * pow(2, ri) / 2,
                                      left: 0,
                                      child: Container(
                                        width: connectorW,
                                        height: baseSlotH * pow(2, ri),
                                        decoration: const BoxDecoration(
                                          border: Border(
                                            top:    BorderSide(color: Color(0x556366F1), width: 2),
                                            right:  BorderSide(color: Color(0x556366F1), width: 2),
                                            bottom: BorderSide(color: Color(0x556366F1), width: 2),
                                          ),
                                          borderRadius: BorderRadius.only(
                                            topRight:    Radius.circular(6),
                                            bottomRight: Radius.circular(6),
                                          ),
                                        ),
                                      ),
                                    )
                                  else
                                    Positioned(
                                      top: mi * baseSlotH * pow(2, ri) + baseSlotH * pow(2, ri) / 2 - 1,
                                      left: 0,
                                      child: Container(width: connectorW, height: 2, color: const Color(0x3A6366F1)),
                                    ),
                                ],
                              ],
                            ),
                          ),
                        ]),
                      ),
                  ],
                ],
              ),
            ),
          ),
          if (widget.isAdmin && _isOngoing && _allKnockoutMatchesDone) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: _completing ? null : _completeTournament,
                  icon: _completing
                      ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, valueColor: AlwaysStoppedAnimation(Colors.white)))
                      : const Icon(Icons.emoji_events_rounded, size: 18),
                  label: Text(_completing ? 'Completing…' : 'Declare Champion & Complete'),
                  style: ElevatedButton.styleFrom(backgroundColor: kColorAmber),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildBracketCard({
    required Map<String, dynamic> match,
    required double top,
    required double width,
    required double cardH,
    required Set<int> locked,
  }) {
    final team1  = _teamById(match['team1_id']);
    final team2  = _teamById(match['team2_id']);
    final t1Name = team1?['team_name']?.toString() ?? 'TBD';
    final t2Name = team2?['team_name']?.toString() ?? 'TBD';
    final wId    = match['winner_team_id'];

    bool sameId(dynamic a, dynamic b) {
      if (a == null || b == null) return false;
      final ia = a is int ? a : int.tryParse(a.toString());
      final ib = b is int ? b : int.tryParse(b.toString());
      return ia != null && ib != null && ia == ib;
    }

    final t1Win    = sameId(wId, match['team1_id']);
    final t2Win    = sameId(wId, match['team2_id']);
    final wins     = _gamesWon(match['score_details']?.toString());
    final scoreStr = _scoreDisplay(match['score_details']?.toString());
    final mId      = (match['match_id'] as num?)?.toInt();
    final isLocked = mId != null && locked.contains(mId);
    final canEdit  = widget.isAdmin && _isOngoing && !isLocked;

    return Positioned(
      top: top,
      left: 0,
      child: Container(
        width: width,
        height: cardH,
        decoration: BoxDecoration(
          color: kColorSurface,
          borderRadius: BorderRadius.circular(10),
          boxShadow: const [BoxShadow(color: Color(0x0A000000), blurRadius: 6, offset: Offset(0, 2))],
        ),
        child: Column(children: [
          // Team 1
          Expanded(child: Container(
            decoration: BoxDecoration(
              color: t1Win ? kColorEmerald.withOpacity(0.07) : Colors.transparent,
              borderRadius: const BorderRadius.vertical(top: Radius.circular(10)),
              border: Border(left: BorderSide(color: t1Win ? kColorEmerald : Colors.transparent, width: 3)),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: Row(children: [
              Expanded(child: Text(t1Name,
                maxLines: 1, overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 11, fontWeight: t1Win ? FontWeight.w700 : FontWeight.w500,
                  color: t1Win ? kColorEmerald : kColorText))),
              if (wins['team1'] != null)
                Text('${wins['team1']}', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800,
                  color: t1Win ? kColorEmerald : kColorMuted)),
            ]),
          )),
          Container(height: 1, color: const Color(0x12000000)),
          // Team 2
          Expanded(child: Container(
            decoration: BoxDecoration(
              color: t2Win ? kColorEmerald.withOpacity(0.07) : Colors.transparent,
              border: Border(left: BorderSide(color: t2Win ? kColorEmerald : Colors.transparent, width: 3)),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: Row(children: [
              Expanded(child: Text(t2Name,
                maxLines: 1, overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 11, fontWeight: t2Win ? FontWeight.w700 : FontWeight.w500,
                  color: t2Win ? kColorEmerald : kColorText))),
              if (wins['team2'] != null)
                Text('${wins['team2']}', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800,
                  color: t2Win ? kColorEmerald : kColorMuted)),
            ]),
          )),
          Container(height: 1, color: const Color(0x12000000)),
          // Score bar
          SizedBox(
            height: 26,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              child: Row(children: [
                Expanded(child: Text(
                  scoreStr.isNotEmpty ? scoreStr : 'Not played',
                  maxLines: 1, overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 9,
                    fontStyle: scoreStr.isEmpty ? FontStyle.italic : FontStyle.normal,
                    color: scoreStr.isNotEmpty ? kColorMuted : kColorMuted.withOpacity(0.4)),
                )),
                if (isLocked)
                  const Icon(Icons.lock_outline_rounded, size: 11, color: kColorMuted)
                else if (canEdit)
                  GestureDetector(
                    onTap: () => _showScoreSheet(match),
                    child: Text(wId != null ? 'Edit' : 'Score',
                      style: const TextStyle(color: kColorPrimary, fontSize: 10, fontWeight: FontWeight.w700)),
                  ),
              ]),
            ),
          ),
        ]),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Score Sheet Modal
// ─────────────────────────────────────────────────────────────────────────────

class _ScoreSheetModal extends StatefulWidget {
  final Map<String, dynamic> match;
  final List<Map<String, dynamic>> teams;
  final String tournamentType;
  final String clanId;
  final String tournamentId;
  final VoidCallback onSaved;

  const _ScoreSheetModal({
    required this.match,
    required this.teams,
    required this.tournamentType,
    required this.clanId,
    required this.tournamentId,
    required this.onSaved,
  });

  @override
  State<_ScoreSheetModal> createState() => _ScoreSheetModalState();
}

class _ScoreSheetModalState extends State<_ScoreSheetModal> {
  late final TextEditingController _scoreCtrl;
  List<String> _t1Selected = [];
  List<String> _t2Selected = [];
  bool _saving = false;

  int get _playersNeeded => widget.tournamentType == 'doubles' ? 2 : 1;

  Map<String, dynamic>? _teamById(dynamic id) {
    if (id == null) return null;
    final target = id is int ? id : int.tryParse(id.toString());
    if (target == null) return null;
    for (final t in widget.teams) {
      final tid = t['team_id'] is int
          ? t['team_id'] as int
          : int.tryParse(t['team_id']?.toString() ?? '');
      if (tid == target) return t;
    }
    return null;
  }

  @override
  void initState() {
    super.initState();
    String existing = '';
    try {
      final raw = widget.match['score_details']?.toString();
      if (raw != null && raw.isNotEmpty) {
        final parsed = jsonDecode(raw) as Map<String, dynamic>;
        existing = parsed['score']?.toString() ?? '';
      }
    } catch (_) {}
    _scoreCtrl = TextEditingController(text: existing);

    final t1 = _teamById(widget.match['team1_id']);
    final t2 = _teamById(widget.match['team2_id']);
    final t1Details = List<Map<String, dynamic>>.from(t1?['playersDetails'] ?? []);
    final t2Details = List<Map<String, dynamic>>.from(t2?['playersDetails'] ?? []);

    try {
      final raw1 = widget.match['team1_players'];
      if (raw1 != null && raw1 != 'null') {
        _t1Selected = List<String>.from(jsonDecode(raw1));
      }
    } catch (_) {}
    if (_t1Selected.isEmpty && t1Details.length == _playersNeeded) {
      _t1Selected = t1Details.map((p) => p['user_id'].toString()).toList();
    }

    try {
      final raw2 = widget.match['team2_players'];
      if (raw2 != null && raw2 != 'null') {
        _t2Selected = List<String>.from(jsonDecode(raw2));
      }
    } catch (_) {}
    if (_t2Selected.isEmpty && t2Details.length == _playersNeeded) {
      _t2Selected = t2Details.map((p) => p['user_id'].toString()).toList();
    }
  }

  @override
  void dispose() { _scoreCtrl.dispose(); super.dispose(); }

  void _togglePlayer(int side, String userId) {
    setState(() {
      final sel = side == 1 ? _t1Selected : _t2Selected;
      if (_playersNeeded == 1) {
        sel.clear();
        sel.add(userId);
      } else {
        if (sel.contains(userId)) sel.remove(userId);
        else if (sel.length < _playersNeeded) sel.add(userId);
      }
    });
  }

  Future<void> _save() async {
    final score = _scoreCtrl.text.trim();
    if (score.isEmpty) return;
    setState(() => _saving = true);
    try {
      final games = _parseScore(score);
      int t1Wins = 0, t2Wins = 0;
      for (final g in games) {
        if ((g['team1'] ?? 0) > (g['team2'] ?? 0)) t1Wins++;
        else if ((g['team2'] ?? 0) > (g['team1'] ?? 0)) t2Wins++;
      }
      final winnerId = t1Wins > t2Wins
          ? widget.match['team1_id']
          : t2Wins > t1Wins
              ? widget.match['team2_id']
              : null;
      await ApiService.instance.post('/api/clans/tournaments/update_match', {
        'clanId':         widget.clanId,
        'tournamentId':   widget.tournamentId,
        'matchId':        widget.match['match_id'],
        'winner_team_id': winnerId,
        'score_details':  jsonEncode({'score': score, 'games': games}),
        if (_t1Selected.isNotEmpty) 'team1_players': _t1Selected,
        if (_t2Selected.isNotEmpty) 'team2_players': _t2Selected,
      });
      if (mounted) Navigator.pop(context);
      widget.onSaved();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
        setState(() => _saving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final team1    = _teamById(widget.match['team1_id']);
    final team2    = _teamById(widget.match['team2_id']);
    final t1Name   = team1?['team_name']?.toString() ?? 'Team 1';
    final t2Name   = team2?['team_name']?.toString() ?? 'Team 2';
    final t1Players = List<Map<String, dynamic>>.from(team1?['playersDetails'] ?? []);
    final t2Players = List<Map<String, dynamic>>.from(team2?['playersDetails'] ?? []);
    final needsPicker  = t1Players.length > _playersNeeded || t2Players.length > _playersNeeded;
    final selectionValid = !needsPicker ||
        (_t1Selected.length == _playersNeeded && _t2Selected.length == _playersNeeded);

    return Padding(
      padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(context).viewInsets.bottom + 20),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Update Score', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: kColorText)),
            Text('$t1Name  vs  $t2Name', style: const TextStyle(color: kColorMuted, fontSize: 12)),
          ])),
          IconButton(icon: const Icon(Icons.close_rounded, color: kColorMuted),
              onPressed: () => Navigator.pop(context),
              padding: EdgeInsets.zero, constraints: const BoxConstraints()),
        ]),
        const SizedBox(height: 16),
        if (needsPicker) ...[
          Text('WHO IS PLAYING? — SELECT $_playersNeeded PER TEAM',
              style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: kColorMuted, letterSpacing: 0.8)),
          const SizedBox(height: 10),
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(child: _playerPicker(t1Name, t1Players, _t1Selected, 1, kColorPrimary)),
            const SizedBox(width: 12),
            Expanded(child: _playerPicker(t2Name, t2Players, _t2Selected, 2, kColorEmerald)),
          ]),
          if (!selectionValid) ...[
            const SizedBox(height: 6),
            Text('Select exactly $_playersNeeded player${_playersNeeded > 1 ? 's' : ''} from each team.',
                style: const TextStyle(color: kColorRose, fontSize: 11)),
          ],
          const SizedBox(height: 14),
        ],
        TextField(
          controller: _scoreCtrl,
          autofocus: !needsPicker,
          decoration: InputDecoration(
            labelText: 'Score',
            hintText: '21-19, 15-21, 21-18',
            helperText: 'Comma-separated games. $t1Name listed first.',
          ),
        ),
        const SizedBox(height: 16),
        Row(children: [
          Expanded(child: OutlinedButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel'))),
          const SizedBox(width: 10),
          Expanded(child: ElevatedButton(
              onPressed: _saving || !selectionValid ? null : _save,
              child: _saving
                  ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2, valueColor: AlwaysStoppedAnimation(Colors.white)))
                  : const Text('Save Score'))),
        ]),
      ]),
    );
  }

  Widget _playerPicker(String teamName, List<Map<String, dynamic>> players,
      List<String> selected, int side, Color color) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(teamName, style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w700)),
      const SizedBox(height: 6),
      ...players.map((p) {
        final uid        = p['user_id'].toString();
        final isSelected = selected.contains(uid);
        final isDisabled = !isSelected && selected.length >= _playersNeeded;
        return GestureDetector(
          onTap: isDisabled ? null : () => _togglePlayer(side, uid),
          child: Container(
            margin: const EdgeInsets.only(bottom: 6),
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: isSelected ? color.withOpacity(0.1) : kColorSurface,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: isSelected ? color.withOpacity(0.3) : kColorMuted.withOpacity(0.15)),
            ),
            child: Row(children: [
              Icon(
                _playersNeeded == 1
                    ? (isSelected ? Icons.radio_button_checked : Icons.radio_button_unchecked)
                    : (isSelected ? Icons.check_box : Icons.check_box_outline_blank),
                color: isSelected ? color : kColorMuted, size: 16),
              const SizedBox(width: 8),
              Expanded(child: Text(p['name']?.toString() ?? uid,
                style: TextStyle(
                  fontSize: 12,
                  color: isDisabled ? kColorMuted.withOpacity(0.5) : kColorText,
                  fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500))),
            ]),
          ),
        );
      }),
    ]);
  }
}
