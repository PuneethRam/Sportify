import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../core/theme.dart';
import '../../services/analytics.dart';
import '../../services/api_service.dart';
import '../../services/push_service.dart';
import '../../widgets/loading_screen.dart';
import '../../widgets/pending_results.dart';

class SeriesDetailScreen extends StatefulWidget {
  final String clanId;
  final String seriesId;
  const SeriesDetailScreen({super.key, required this.clanId, required this.seriesId});

  @override
  State<SeriesDetailScreen> createState() => _SeriesDetailScreenState();
}

class _SeriesDetailScreenState extends State<SeriesDetailScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;
  Map<String, dynamic>? _series;
  List<Map<String, dynamic>> _matches = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 3, vsync: this);
    _load();
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final data = await ApiService.instance.get(
        '/api/clans/series/get_series_details',
        query: {'clanId': widget.clanId, 'seriesId': widget.seriesId},
      );
      setState(() {
        _series  = data['series'] as Map<String, dynamic>?;
        _matches = List<Map<String, dynamic>>.from(data['matches'] ?? []);
        _loading = false;
      });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  Future<void> _finishSeries() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Finish Series'),
        content: const Text(
            'This will determine the winner based on current results. Cannot be undone.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: kColorAmber),
            child: const Text('Finish'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    try {
      await ApiService.instance.post('/api/clans/series/finish_series', {
        'clanId': widget.clanId,
        'seriesId': widget.seriesId,
      });
      _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.toString())));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return Scaffold(
        appBar: AppBar(title: const Text('Series')),
        body: const CenteredLoader(),
      );
    }
    if (_error != null || _series == null) {
      return Scaffold(
        appBar: AppBar(),
        body: ErrorView(message: _error ?? 'Not found', onRetry: _load),
      );
    }

    final s          = _series!;
    final team1Name  = s['team1_name']?.toString() ?? 'Team 1';
    final team2Name  = s['team2_name']?.toString() ?? 'Team 2';
    final total      = (s['total_matches'] as num?)?.toInt() ?? 5;
    final winner     = s['winner_team']?.toString();
    final finished   = winner != null;
    final seriesType = s['series_type']?.toString() ?? 'singles';
    final t1Players  = List<Map<String, dynamic>>.from(
        s['Team1_players'] ?? s['team1_players'] ?? s['team1Players'] ?? []);
    final t2Players  = List<Map<String, dynamic>>.from(
        s['Team2_players'] ?? s['team2_players'] ?? s['team2Players'] ?? []);

    final t1Wins = _matches.where((m) => m['winner'] == 'player1').length;
    final t2Wins = _matches.where((m) => m['winner'] == 'player2').length;
    final draws  = _matches.where((m) => m['winner'] == 'draw').length;
    final needed = total > 0 ? ((total / 2).ceil()) : null;

    return Scaffold(
      appBar: AppBar(
        title: Text('$team1Name vs $team2Name',
            maxLines: 1, overflow: TextOverflow.ellipsis),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_outlined, size: 20),
            onPressed: _load,
          ),
        ],
        bottom: TabBar(
          controller: _tabs,
          tabs: [
            const Tab(text: 'Squads'),
            Tab(text: 'Matches (${_matches.length})'),
            Tab(text: finished ? 'Finished' : 'Play'),
          ],
        ),
      ),
      body: Column(children: [
        _Scoreboard(
          team1Name: team1Name,
          team2Name: team2Name,
          t1Wins: t1Wins,
          t2Wins: t2Wins,
          draws: draws,
          needed: needed,
          total: total,
          finished: finished,
          winner: winner,
          seriesType: seriesType,
          matchCount: _matches.length,
        ),
        Expanded(
          child: TabBarView(
            controller: _tabs,
            children: [
              _SquadsTab(
                seriesType: seriesType,
                team1Name: team1Name,
                team2Name: team2Name,
                t1Players: t1Players,
                t2Players: t2Players,
              ),
              _MatchesTab(
                matches: _matches,
                allT1Players: t1Players,
                allT2Players: t2Players,
                team1Name: team1Name,
                team2Name: team2Name,
                finished: finished,
                onFinish: _finishSeries,
                onGoPlay: () => _tabs.animateTo(2),
              ),
              if (finished)
                _FinishedTab(
                  winnerName: winner!,
                  onViewMatches: () => _tabs.animateTo(1),
                )
              else
                _PlayTab(
                  seriesType: seriesType,
                  team1Name: team1Name,
                  team2Name: team2Name,
                  t1Players: t1Players,
                  t2Players: t2Players,
                  clanId: widget.clanId,
                  seriesId: widget.seriesId,
                  onMatchRecorded: _load,
                ),
            ],
          ),
        ),
      ]),
    );
  }
}

// ── Scoreboard ────────────────────────────────────────────────────────────────

class _Scoreboard extends StatelessWidget {
  final String team1Name;
  final String team2Name;
  final int t1Wins;
  final int t2Wins;
  final int draws;
  final int? needed;
  final int total;
  final bool finished;
  final String? winner;
  final String seriesType;
  final int matchCount;

  const _Scoreboard({
    required this.team1Name,
    required this.team2Name,
    required this.t1Wins,
    required this.t2Wins,
    required this.draws,
    required this.needed,
    required this.total,
    required this.finished,
    required this.winner,
    required this.seriesType,
    required this.matchCount,
  });

  @override
  Widget build(BuildContext context) {
    if (finished) {
      return Container(
        margin: const EdgeInsets.fromLTRB(16, 16, 16, 0),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
              colors: [Color(0xFFF59E0B), Color(0xFFD97706)]),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(children: [
          const Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            Icon(Icons.emoji_events_rounded, color: Colors.white, size: 18),
            SizedBox(width: 6),
            Text('SERIES COMPLETED',
                style: TextStyle(
                    color: Colors.white,
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.2)),
          ]),
          const SizedBox(height: 6),
          Text(winner ?? '',
              style: const TextStyle(
                  color: Colors.white, fontSize: 20, fontWeight: FontWeight.w900)),
          Text(
              'Final score $t1Wins–$t2Wins'
              '${draws > 0 ? " (${draws} draw${draws > 1 ? 's' : ''})" : ""}',
              style: const TextStyle(color: Colors.white70, fontSize: 11)),
        ]),
      );
    }

    if (matchCount == 0) return const SizedBox.shrink();

    final t1Leading = t1Wins > t2Wins;
    final t2Leading = t2Wins > t1Wins;
    final leadMsg = t1Wins == t2Wins
        ? 'Tied · $t1Wins–$t2Wins'
        : t1Wins > t2Wins
            ? '$team1Name leads · $t1Wins–$t2Wins'
            : '$team2Name leads · $t2Wins–$t1Wins';

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 16, 16, 0),
      decoration: const BoxDecoration(
        color: kColorSurface,
        borderRadius: BorderRadius.all(Radius.circular(16)),
        boxShadow: [
          BoxShadow(color: Color(0x0A000000), blurRadius: 8, offset: Offset(0, 2)),
          BoxShadow(color: Color(0x04000000), blurRadius: 2),
        ],
      ),
      child: IntrinsicHeight(
        child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          // Team 1
          Expanded(
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 10),
              decoration: BoxDecoration(
                color: t1Leading
                    ? kColorPrimary.withOpacity(0.05)
                    : Colors.transparent,
                borderRadius:
                    const BorderRadius.horizontal(left: Radius.circular(16)),
              ),
              child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(team1Name,
                        style: const TextStyle(
                            color: kColorPrimary,
                            fontSize: 11,
                            fontWeight: FontWeight.w700),
                        textAlign: TextAlign.center,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis),
                    const SizedBox(height: 4),
                    Text('$t1Wins',
                        style: TextStyle(
                            color: t1Leading ? kColorPrimary : kColorMuted,
                            fontSize: 42,
                            fontWeight: FontWeight.w900,
                            height: 1)),
                    if (needed != null && t1Wins >= needed!)
                      Container(
                        margin: const EdgeInsets.only(top: 4),
                        padding: const EdgeInsets.symmetric(
                            horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: kColorPrimary.withOpacity(0.12),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: const Text('Match point',
                            style: TextStyle(
                                color: kColorPrimary,
                                fontSize: 9,
                                fontWeight: FontWeight.w800)),
                      ),
                  ]),
            ),
          ),
          // Center info
          Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
            decoration: const BoxDecoration(
              border: Border.symmetric(
                  vertical: BorderSide(color: Color(0x12000000))),
            ),
            child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: const Color(0x08000000),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      seriesType == 'doubles' ? 'DOUBLES' : 'SINGLES',
                      style: const TextStyle(
                          fontSize: 8,
                          fontWeight: FontWeight.w700,
                          color: kColorMuted,
                          letterSpacing: 1),
                    ),
                  ),
                  if (draws > 0) ...[
                    const SizedBox(height: 4),
                    Text('$draws draw${draws > 1 ? "s" : ""}',
                        style: const TextStyle(
                            fontSize: 9, color: kColorMuted)),
                  ],
                  const SizedBox(height: 6),
                  Text(leadMsg,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                          fontSize: 9, color: kColorMuted)),
                  if (needed != null) ...[
                    const SizedBox(height: 4),
                    Text('First to $needed',
                        style: const TextStyle(
                            fontSize: 9, color: kColorMuted)),
                  ],
                ]),
          ),
          // Team 2
          Expanded(
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 10),
              decoration: BoxDecoration(
                color: t2Leading
                    ? kColorRose.withOpacity(0.05)
                    : Colors.transparent,
                borderRadius:
                    const BorderRadius.horizontal(right: Radius.circular(16)),
              ),
              child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(team2Name,
                        style: const TextStyle(
                            color: kColorRose,
                            fontSize: 11,
                            fontWeight: FontWeight.w700),
                        textAlign: TextAlign.center,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis),
                    const SizedBox(height: 4),
                    Text('$t2Wins',
                        style: TextStyle(
                            color: t2Leading ? kColorRose : kColorMuted,
                            fontSize: 42,
                            fontWeight: FontWeight.w900,
                            height: 1)),
                    if (needed != null && t2Wins >= needed!)
                      Container(
                        margin: const EdgeInsets.only(top: 4),
                        padding: const EdgeInsets.symmetric(
                            horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: kColorRose.withOpacity(0.12),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: const Text('Match point',
                            style: TextStyle(
                                color: kColorRose,
                                fontSize: 9,
                                fontWeight: FontWeight.w800)),
                      ),
                  ]),
            ),
          ),
        ]),
      ),
    );
  }
}

// ── Squads Tab ────────────────────────────────────────────────────────────────

class _SquadsTab extends StatelessWidget {
  final String seriesType;
  final String team1Name;
  final String team2Name;
  final List<Map<String, dynamic>> t1Players;
  final List<Map<String, dynamic>> t2Players;

  const _SquadsTab({
    required this.seriesType,
    required this.team1Name,
    required this.team2Name,
    required this.t1Players,
    required this.t2Players,
  });

  List<String> _duoPairs(List<Map<String, dynamic>> players) {
    final pairs = <String>[];
    for (int i = 0; i < players.length; i++) {
      for (int j = i + 1; j < players.length; j++) {
        pairs.add(
            '${players[i]['name'] ?? ''} & ${players[j]['name'] ?? ''}');
      }
    }
    return pairs;
  }

  @override
  Widget build(BuildContext context) {
    final t1Pairs =
        seriesType == 'doubles' ? _duoPairs(t1Players) : <String>[];
    final t2Pairs =
        seriesType == 'doubles' ? _duoPairs(t2Players) : <String>[];

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
              child: _TeamSquad(
            teamName: team1Name,
            players: t1Players,
            color: kColorPrimary,
            duoPairs: t1Pairs,
          )),
          const SizedBox(width: 12),
          Expanded(
              child: _TeamSquad(
            teamName: team2Name,
            players: t2Players,
            color: kColorRose,
            duoPairs: t2Pairs,
          )),
        ],
      ),
    );
  }
}

class _TeamSquad extends StatelessWidget {
  final String teamName;
  final List<Map<String, dynamic>> players;
  final Color color;
  final List<String> duoPairs;

  const _TeamSquad({
    required this.teamName,
    required this.players,
    required this.color,
    required this.duoPairs,
  });

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: color.withOpacity(0.05),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: color.withOpacity(0.2)),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(teamName,
              style: TextStyle(
                  color: color,
                  fontSize: 13,
                  fontWeight: FontWeight.w800)),
          const SizedBox(height: 2),
          Text('${players.length} Players',
              style:
                  const TextStyle(color: kColorMuted, fontSize: 11)),
          const SizedBox(height: 12),
          if (players.isEmpty)
            const Text('No players assigned',
                style: TextStyle(color: kColorMuted, fontSize: 12))
          else
            ...players.map((p) {
              final name = p['name']?.toString() ?? '';
              final initial = name.isNotEmpty ? name[0].toUpperCase() : '?';
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(children: [
                  CircleAvatar(
                    radius: 14,
                    backgroundColor: color.withOpacity(0.15),
                    child: Text(initial,
                        style: TextStyle(
                            color: color,
                            fontSize: 11,
                            fontWeight: FontWeight.w700)),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(name,
                        style: const TextStyle(
                            fontSize: 12,
                            color: kColorText,
                            fontWeight: FontWeight.w600),
                        overflow: TextOverflow.ellipsis),
                  ),
                ]),
              );
            }),
          if (duoPairs.isNotEmpty) ...[
            Divider(height: 20, color: color.withOpacity(0.2)),
            Text('Possible Duos (${duoPairs.length})',
                style: TextStyle(
                    color: color,
                    fontSize: 11,
                    fontWeight: FontWeight.w700)),
            const SizedBox(height: 6),
            ...duoPairs.map((pair) => Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Row(children: [
                    Icon(Icons.people_outline,
                        color: color.withOpacity(0.5), size: 12),
                    const SizedBox(width: 4),
                    Expanded(
                        child: Text(pair,
                            style: const TextStyle(
                                color: kColorMuted, fontSize: 11))),
                  ]),
                )),
          ],
        ]),
      );
}

// ── Matches Tab ────────────────────────────────────────────────────────────────

class _MatchesTab extends StatelessWidget {
  final List<Map<String, dynamic>> matches;
  final List<Map<String, dynamic>> allT1Players;
  final List<Map<String, dynamic>> allT2Players;
  final String team1Name;
  final String team2Name;
  final bool finished;
  final VoidCallback onFinish;
  final VoidCallback onGoPlay;

  const _MatchesTab({
    required this.matches,
    required this.allT1Players,
    required this.allT2Players,
    required this.team1Name,
    required this.team2Name,
    required this.finished,
    required this.onFinish,
    required this.onGoPlay,
  });

  String _playerName(String uid, List<Map<String, dynamic>> pool) {
    try {
      final p = pool.firstWhere(
          (e) => e['user_id']?.toString() == uid,
          orElse: () => {});
      return p['name']?.toString() ?? uid;
    } catch (_) {
      return uid;
    }
  }

  @override
  Widget build(BuildContext context) {
    if (matches.isEmpty) {
      return EmptyView(
        message: 'No matches recorded yet',
        icon: Icons.sports_tennis_rounded,
        action: !finished
            ? ElevatedButton(
                onPressed: onGoPlay,
                child: const Text('Record First Match'))
            : null,
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: matches.length + ((!finished) ? 1 : 0),
      itemBuilder: (context, index) {
        if (index == matches.length) {
          return Padding(
            padding: const EdgeInsets.only(top: 8),
            child: ElevatedButton(
              onPressed: onFinish,
              style: ElevatedButton.styleFrom(backgroundColor: kColorAmber),
              child: const Text('Finish Series'),
            ),
          );
        }

        final m      = matches[index];
        final winner = m['winner']?.toString();
        final t1Won  = winner == 'player1';
        final t2Won  = winner == 'player2';
        final isDraw = winner == 'draw';

        final sd     = m['scoreDetails'] as Map<String, dynamic>?;
        final score  = sd?['score']?.toString() ?? '';
        final t1Pids = List<String>.from(sd?['team1Players'] ?? []);
        final t2Pids = List<String>.from(sd?['team2Players'] ?? []);

        final t1Names = t1Pids
            .map((id) => _playerName(id, allT1Players))
            .join(' & ');
        final t2Names = t2Pids
            .map((id) => _playerName(id, allT2Players))
            .join(' & ');

        String dateStr = '';
        final d = DateTime.tryParse(m['match_date']?.toString() ?? '');
        if (d != null) dateStr = DateFormat('MMM d, yyyy').format(d);

        final winColor =
            t1Won ? kColorPrimary : (t2Won ? kColorRose : kColorMuted);

        return Container(
          margin: const EdgeInsets.only(bottom: 10),
          decoration: const BoxDecoration(
            color: kColorSurface,
            borderRadius: BorderRadius.all(Radius.circular(14)),
            boxShadow: [
              BoxShadow(color: Color(0x0A000000), blurRadius: 8, offset: Offset(0, 2)),
            ],
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            // Header
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
              child: Row(children: [
                Container(
                  width: 26, height: 26,
                  decoration: BoxDecoration(
                    color: winColor.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(7),
                  ),
                  alignment: Alignment.center,
                  child: Text('${index + 1}',
                      style: TextStyle(
                          color: winColor,
                          fontSize: 11,
                          fontWeight: FontWeight.w800)),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _MatchRow(
                          name: t1Names.isNotEmpty ? t1Names : team1Name,
                          color: kColorPrimary,
                          isWinner: t1Won,
                        ),
                        const SizedBox(height: 4),
                        _MatchRow(
                          name: t2Names.isNotEmpty ? t2Names : team2Name,
                          color: kColorRose,
                          isWinner: t2Won,
                        ),
                      ]),
                ),
                if (isDraw)
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: kColorMuted.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: const Text('DRAW',
                        style: TextStyle(
                            color: kColorMuted,
                            fontSize: 9,
                            fontWeight: FontWeight.w800)),
                  ),
              ]),
            ),
            if (score.isNotEmpty || dateStr.isNotEmpty) ...[
              Divider(height: 1, color: const Color(0x0C000000)),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
                child: Row(children: [
                  if (score.isNotEmpty) ...[
                    const Icon(Icons.scoreboard_outlined,
                        size: 12, color: kColorMuted),
                    const SizedBox(width: 4),
                    Text(score,
                        style: const TextStyle(
                            fontSize: 12,
                            color: kColorMuted,
                            fontWeight: FontWeight.w600)),
                  ],
                  const Spacer(),
                  if (dateStr.isNotEmpty) ...[
                    const Icon(Icons.calendar_today_outlined,
                        size: 11, color: kColorMuted),
                    const SizedBox(width: 4),
                    Text(dateStr,
                        style: const TextStyle(
                            fontSize: 11, color: kColorMuted)),
                  ],
                ]),
              ),
            ],
          ]),
        );
      },
    );
  }
}

class _MatchRow extends StatelessWidget {
  final String name;
  final Color color;
  final bool isWinner;

  const _MatchRow({
    required this.name,
    required this.color,
    required this.isWinner,
  });

  @override
  Widget build(BuildContext context) => Row(children: [
        Container(
          width: 8, height: 8,
          decoration: BoxDecoration(
            color: color.withOpacity(0.6),
            borderRadius: BorderRadius.circular(2),
          ),
        ),
        const SizedBox(width: 6),
        Expanded(
          child: Text(name,
              style: TextStyle(
                  fontSize: 12,
                  color: isWinner ? color : kColorText,
                  fontWeight:
                      isWinner ? FontWeight.w700 : FontWeight.w500),
              overflow: TextOverflow.ellipsis),
        ),
        if (isWinner) ...[
          const SizedBox(width: 4),
          Icon(Icons.check_circle_rounded, color: color, size: 13),
        ],
      ]);
}

// ── Play Tab ──────────────────────────────────────────────────────────────────

class _PlayTab extends StatefulWidget {
  final String seriesType;
  final String team1Name;
  final String team2Name;
  final List<Map<String, dynamic>> t1Players;
  final List<Map<String, dynamic>> t2Players;
  final String clanId;
  final String seriesId;
  final VoidCallback onMatchRecorded;

  const _PlayTab({
    required this.seriesType,
    required this.team1Name,
    required this.team2Name,
    required this.t1Players,
    required this.t2Players,
    required this.clanId,
    required this.seriesId,
    required this.onMatchRecorded,
  });

  @override
  State<_PlayTab> createState() => _PlayTabState();
}

class _PlayTabState extends State<_PlayTab> {
  late List<String> _selT1;
  late List<String> _selT2;
  final _scoreCtrl = TextEditingController();
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _selT1 = widget.seriesType == 'doubles' ? ['', ''] : [''];
    _selT2 = widget.seriesType == 'doubles' ? ['', ''] : [''];
  }

  @override
  void dispose() {
    _scoreCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final score = _scoreCtrl.text.trim();
    if (score.isEmpty) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Please enter a score')));
      return;
    }
    if ((widget.t1Players.isNotEmpty && _selT1.any((p) => p.isEmpty)) ||
        (widget.t2Players.isNotEmpty && _selT2.any((p) => p.isEmpty))) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Please select all players')));
      return;
    }

    setState(() => _submitting = true);
    try {
      final t1NonEmpty = _selT1.where((p) => p.isNotEmpty).toList();
      final t2NonEmpty = _selT2.where((p) => p.isNotEmpty).toList();
      final Map<String, dynamic> payload;
      if (widget.seriesType == 'singles') {
        payload = {
          'matchType': 'singles',
          'clanId': widget.clanId,
          'series_id': widget.seriesId,
          if (t1NonEmpty.isNotEmpty) 'player1': t1NonEmpty[0],
          if (t2NonEmpty.isNotEmpty) 'player2': t2NonEmpty[0],
          'scoreDetails': {
            'score': score,
            'team1Players': t1NonEmpty,
            'team2Players': t2NonEmpty,
          },
        };
      } else {
        payload = {
          'matchType': 'doubles',
          'clanId': widget.clanId,
          'series_id': widget.seriesId,
          if (t1NonEmpty.length > 0) 'team1Player1': t1NonEmpty[0],
          if (t1NonEmpty.length > 1) 'team1Player2': t1NonEmpty[1],
          if (t2NonEmpty.length > 0) 'team2Player1': t2NonEmpty[0],
          if (t2NonEmpty.length > 1) 'team2Player2': t2NonEmpty[1],
          'scoreDetails': {
            'score': score,
            'team1Players': t1NonEmpty,
            'team2Players': t2NonEmpty,
          },
        };
      }

      final res = await ApiService.instance.post('/api/clans/update_match', payload);
      Analytics.instance.track('match_submitted', {
        'match_type': widget.seriesType == 'doubles' ? 'doubles' : 'singles',
        'status': res['status'] == 'pending' ? 'pending' : 'confirmed',
      });
      _scoreCtrl.clear();
      setState(() {
        _selT1 = widget.seriesType == 'doubles' ? ['', ''] : [''];
        _selT2 = widget.seriesType == 'doubles' ? ['', ''] : [''];
        _submitting = false;
      });
      widget.onMatchRecorded();
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(
                matchSubmitMessage(res, confirmed: 'Match recorded!'))));
        PushService.instance.maybeAskPermission(context);
      }
    } catch (e) {
      setState(() => _submitting = false);
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.toString())));
      }
    }
  }

  @override
  Widget build(BuildContext context) => SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Text('Record New Match',
              style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                  color: kColorText)),
          const SizedBox(height: 16),

          // Player selection (shown only when player lists are available)
          if (widget.t1Players.isNotEmpty || widget.t2Players.isNotEmpty) ...[
            if (widget.seriesType == 'singles') ...[
              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Expanded(
                    child: _TeamDropdowns(
                  teamName: widget.team1Name,
                  players: widget.t1Players,
                  selected: _selT1,
                  color: kColorPrimary,
                  playerLabels: const ['Player'],
                  onChanged: (i, val) => setState(() => _selT1[i] = val),
                )),
                const SizedBox(width: 12),
                Expanded(
                    child: _TeamDropdowns(
                  teamName: widget.team2Name,
                  players: widget.t2Players,
                  selected: _selT2,
                  color: kColorRose,
                  playerLabels: const ['Player'],
                  onChanged: (i, val) => setState(() => _selT2[i] = val),
                )),
              ]),
            ] else ...[
              _TeamDropdowns(
                teamName: widget.team1Name,
                players: widget.t1Players,
                selected: _selT1,
                color: kColorPrimary,
                playerLabels: const ['Player 1', 'Player 2'],
                onChanged: (i, val) => setState(() => _selT1[i] = val),
              ),
              const SizedBox(height: 12),
              _TeamDropdowns(
                teamName: widget.team2Name,
                players: widget.t2Players,
                selected: _selT2,
                color: kColorRose,
                playerLabels: const ['Player 1', 'Player 2'],
                onChanged: (i, val) => setState(() => _selT2[i] = val),
              ),
            ],
          ] else ...[
            // No player roster — show team labels only
            Row(children: [
              Expanded(child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: kColorPrimary.withOpacity(0.06),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: kColorPrimary.withOpacity(0.2)),
                ),
                child: Text(widget.team1Name,
                  style: const TextStyle(color: kColorPrimary, fontSize: 13, fontWeight: FontWeight.w700),
                  textAlign: TextAlign.center),
              )),
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 12),
                child: Text('vs', style: TextStyle(color: kColorMuted, fontWeight: FontWeight.w700)),
              ),
              Expanded(child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: kColorRose.withOpacity(0.06),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: kColorRose.withOpacity(0.2)),
                ),
                child: Text(widget.team2Name,
                  style: const TextStyle(color: kColorRose, fontSize: 13, fontWeight: FontWeight.w700),
                  textAlign: TextAlign.center),
              )),
            ]),
          ],

          const SizedBox(height: 16),

          // Score
          Container(
            padding: const EdgeInsets.all(14),
            decoration: const BoxDecoration(
              color: kColorSurface,
              borderRadius: BorderRadius.all(Radius.circular(14)),
              boxShadow: [BoxShadow(color: Color(0x0A000000), blurRadius: 8, offset: Offset(0, 2))],
            ),
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Match Score',
                      style: TextStyle(
                          color: kColorText,
                          fontSize: 13,
                          fontWeight: FontWeight.w700)),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _scoreCtrl,
                    decoration: const InputDecoration(
                      hintText: 'e.g. 21-19, 15-21, 21-18',
                      isDense: true,
                    ),
                  ),
                  const SizedBox(height: 6),
                  const Text('Enter the full match score',
                      style: TextStyle(color: kColorMuted, fontSize: 11)),
                ]),
          ),

          const SizedBox(height: 16),

          ElevatedButton(
            onPressed: _submitting ? null : _submit,
            child: _submitting
                ? const SizedBox(
                    width: 20, height: 20,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white))
                : const Text('Record Match'),
          ),
        ]),
      );
}

class _TeamDropdowns extends StatelessWidget {
  final String teamName;
  final List<Map<String, dynamic>> players;
  final List<String> selected;
  final Color color;
  final List<String> playerLabels;
  final void Function(int index, String value) onChanged;

  const _TeamDropdowns({
    required this.teamName,
    required this.players,
    required this.selected,
    required this.color,
    required this.playerLabels,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: color.withOpacity(0.05),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color.withOpacity(0.2)),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(teamName,
              style: TextStyle(
                  color: color,
                  fontSize: 12,
                  fontWeight: FontWeight.w800)),
          const SizedBox(height: 10),
          ...List.generate(selected.length, (i) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(playerLabels[i],
                          style: const TextStyle(
                              fontSize: 11,
                              color: kColorMuted,
                              fontWeight: FontWeight.w600)),
                      const SizedBox(height: 4),
                      DropdownButtonFormField<String>(
                        value: selected[i].isEmpty ? null : selected[i],
                        isExpanded: true,
                        decoration: const InputDecoration(
                          isDense: true,
                          contentPadding: EdgeInsets.symmetric(
                              horizontal: 10, vertical: 8),
                        ),
                        hint: const Text('Select player',
                            style: TextStyle(fontSize: 12)),
                        items: players
                            .map((p) => DropdownMenuItem<String>(
                                  value: p['user_id']?.toString() ?? '',
                                  child: Text(
                                    p['name']?.toString() ?? '',
                                    style: const TextStyle(fontSize: 12),
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ))
                            .toList(),
                        onChanged: (val) => onChanged(i, val ?? ''),
                      ),
                    ]),
              )),
        ]),
      );
}

// ── Finished Tab ──────────────────────────────────────────────────────────────

class _FinishedTab extends StatelessWidget {
  final String winnerName;
  final VoidCallback onViewMatches;

  const _FinishedTab(
      {required this.winnerName, required this.onViewMatches});

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child:
              Column(mainAxisSize: MainAxisSize.min, children: [
            const Text('🏆', style: TextStyle(fontSize: 60)),
            const SizedBox(height: 16),
            const Text('Series Completed',
                style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                    color: kColorText)),
            const SizedBox(height: 8),
            const Text('The winner is:',
                style: TextStyle(color: kColorMuted)),
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.symmetric(
                  horizontal: 20, vertical: 12),
              decoration: BoxDecoration(
                color: kColorAmber.withOpacity(0.12),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: kColorAmber.withOpacity(0.3)),
              ),
              child: Text(winnerName,
                  style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w900,
                      color: kColorAmber)),
            ),
            const SizedBox(height: 20),
            TextButton.icon(
              onPressed: onViewMatches,
              icon: const Icon(Icons.history_rounded, size: 16),
              label: const Text('View Match History'),
            ),
          ]),
        ),
      );
}
