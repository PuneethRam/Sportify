import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/theme.dart';
import '../../models/match_model.dart';
import '../../services/analytics.dart';
import '../../services/api_service.dart';
import '../../widgets/loading_screen.dart';
import '../../widgets/pending_results.dart';

class MatchesTab extends StatefulWidget {
  final String clanId;
  final bool isAdmin;
  const MatchesTab({super.key, required this.clanId, required this.isAdmin});

  @override
  State<MatchesTab> createState() => _MatchesTabState();
}

class _MatchesTabState extends State<MatchesTab>
    with AutomaticKeepAliveClientMixin {
  List<ClanMatch> _matches = [];
  List<Map<String, dynamic>> _pending = [];
  String? _resolvingId;
  bool _loading = true;
  String _statusFilter = 'all';
  String _typeFilter   = 'all';

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    _loadPending();
    try {
      final data = await ApiService.instance.get(
        '/api/clans/get_matches',
        query: {'id': widget.clanId},
      );
      final raw = data['data'];
      final all = raw is Map
          ? (raw['all'] as List? ?? [])
          : (raw as List? ?? []);
      setState(() {
        _matches = all.map((e) => ClanMatch.fromJson(e as Map<String, dynamic>)).toList();
        _loading = false;
      });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  // Results awaiting confirmation — never cached, they change as players act
  Future<void> _loadPending() async {
    try {
      final data = await ApiService.instance.get(
        '/api/clans/matches/pending',
        query: {'clanId': widget.clanId},
        cached: false,
      );
      final list = (data['data'] as List? ?? []).cast<Map<String, dynamic>>();
      if (mounted) setState(() => _pending = list);
    } catch (_) {}
  }

  Future<void> _resolve(Map<String, dynamic> item, String action) async {
    if (action == 'reject') {
      final ok = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Dispute result?'),
          content: const Text('The result will not count until a clan admin resolves it.'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Dispute')),
          ],
        ),
      );
      if (ok != true) return;
    }

    setState(() => _resolvingId = item['submissionId']?.toString());
    try {
      await ApiService.instance.post('/api/clans/matches/confirm', {
        'submissionId': item['submissionId'],
        'action': action,
      });
      Analytics.instance.track(
        action == 'confirm' ? 'match_confirmed' : 'match_disputed',
        {'match_type': item['matchType']?.toString() ?? 'unknown'},
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(action == 'confirm' ? 'Result confirmed' : 'Result disputed')));
      }
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(
          e.statusCode == 409 ? 'This result was already resolved' : e.message)));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
      }
    } finally {
      if (mounted) {
        setState(() => _resolvingId = null);
        _load();
      }
    }
  }

  List<ClanMatch> get _filtered => _matches.where((m) {
    final statusOk = _statusFilter == 'all' ||
        (_statusFilter == 'live'     && m.isLive)    ||
        (_statusFilter == 'upcoming' && m.isUpcoming) ||
        (_statusFilter == 'recent'   && m.isComplete);
    final typeOk = _typeFilter == 'all' || m.type == _typeFilter;
    return statusOk && typeOk;
  }).toList();

  @override
  Widget build(BuildContext context) {
    super.build(context);
    if (_loading) return const CenteredLoader();

    return Column(children: [
      _Filters(
        status: _statusFilter,
        type: _typeFilter,
        onStatus: (v) => setState(() => _statusFilter = v),
        onType:   (v) => setState(() => _typeFilter   = v),
      ),
      Expanded(
        child: _filtered.isEmpty && _pending.isEmpty
            ? EmptyView(
                message: 'No matches yet',
                icon: Icons.sports_tennis_outlined,
                action: widget.isAdmin
                    ? ElevatedButton(
                        onPressed: _showNewMatch,
                        child: const Text('Start Match'),
                      )
                    : null,
              )
            : _buildList(),
      ),
    ]);
  }

  Widget _buildList() {
    // Header rows (pending results, admin action) precede the match cards
    final header = <Widget>[
      if (_pending.isNotEmpty)
        Padding(
          padding: const EdgeInsets.only(bottom: 6),
          child: PendingResultsSection(
            items: _pending,
            busyId: _resolvingId,
            onAction: _resolve,
          ),
        ),
      if (widget.isAdmin)
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: ElevatedButton.icon(
            onPressed: _showNewMatch,
            icon: const Icon(Icons.add, size: 18),
            label: const Text('Start New Match'),
          ),
        ),
      if (_filtered.isEmpty)
        const EmptyView(message: 'No matches yet', icon: Icons.sports_tennis_outlined),
    ];

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: header.length + _filtered.length,
      itemBuilder: (_, i) {
        if (i < header.length) return header[i];
        return Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: _MatchCard(match: _filtered[i - header.length]),
        );
      },
    );
  }

  Future<void> _showNewMatch() async {
    await context.push('/clans/${widget.clanId}/start-match');
    if (mounted) _load();
  }
}

class _Filters extends StatelessWidget {
  final String status;
  final String type;
  final ValueChanged<String> onStatus;
  final ValueChanged<String> onType;

  const _Filters({
    required this.status, required this.type,
    required this.onStatus, required this.onType,
  });

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.fromLTRB(12, 10, 12, 0),
    child: Column(children: [
      SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(children: [
          for (final s in ['all', 'live', 'upcoming', 'recent'])
            Padding(
              padding: const EdgeInsets.only(right: 6),
              child: FilterChip(
                label: Text(s == 'all' ? 'All' : s[0].toUpperCase() + s.substring(1)),
                selected: status == s,
                onSelected: (_) => onStatus(s),
              ),
            ),
        ]),
      ),
      const SizedBox(height: 6),
      SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(children: [
          for (final t in ['all', 'singles', 'doubles'])
            Padding(
              padding: const EdgeInsets.only(right: 6),
              child: FilterChip(
                label: Text(t == 'all' ? 'All Types' : t[0].toUpperCase() + t.substring(1)),
                selected: type == t,
                onSelected: (_) => onType(t),
              ),
            ),
        ]),
      ),
    ]),
  );
}

class _MatchCard extends StatelessWidget {
  final ClanMatch match;
  const _MatchCard({required this.match});

  @override
  Widget build(BuildContext context) {
    final isLive    = match.isLive;
    final isDone    = match.isComplete;
    final w1        = match.winnerIsTeam1;
    final w2        = match.winnerIsTeam2;

    String? dateStr;
    if (match.matchDate != null) {
      final d = DateTime.tryParse(match.matchDate!);
      if (d != null) dateStr = DateFormat('MMM d, h:mm a').format(d);
    }

    final accentColor = isLive ? kColorRose : isDone ? kColorEmerald : kColorPrimary;
    final statusLabel = isLive ? 'LIVE' : isDone ? 'DONE' : 'UPCOMING';

    return Container(
      decoration: BoxDecoration(
        color: kColorSurface,
        borderRadius: BorderRadius.circular(16),
        boxShadow: const [
          BoxShadow(color: Color(0x0A000000), blurRadius: 8, offset: Offset(0, 2)),
          BoxShadow(color: Color(0x04000000), blurRadius: 2),
        ],
      ),
      clipBehavior: Clip.hardEdge,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        // Top accent bar
        Container(height: 3,
          decoration: BoxDecoration(
            gradient: LinearGradient(colors: [accentColor, accentColor.withOpacity(0.5)]))),

        Padding(
          padding: const EdgeInsets.all(14),
          child: Column(children: [
            // Header row
            Row(children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: accentColor.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  if (isLive) Container(
                    width: 6, height: 6, margin: const EdgeInsets.only(right: 4),
                    decoration: const BoxDecoration(color: kColorRose, shape: BoxShape.circle)),
                  Text(statusLabel, style: TextStyle(
                    color: accentColor, fontSize: 10, fontWeight: FontWeight.w800)),
                ]),
              ),
              const SizedBox(width: 8),
              Icon(
                match.type == 'singles' ? Icons.person_rounded : Icons.people_rounded,
                size: 14, color: kColorMuted),
              const SizedBox(width: 4),
              Text(match.type.toUpperCase(), style: const TextStyle(
                color: kColorMuted, fontSize: 10, fontWeight: FontWeight.w600, letterSpacing: 0.5)),
              const Spacer(),
              if (dateStr != null)
                Text(dateStr, style: const TextStyle(color: kColorMuted, fontSize: 11)),
            ]),
            const SizedBox(height: 12),

            // Team 1 row
            _TeamRow(
              names: match.team1,
              scores: match.scores.map((s) => s.isNotEmpty ? s[0] : 0).toList(),
              isWinner: w1, isDone: isDone,
            ),

            Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Row(children: [
                const Expanded(child: Divider(color: Color(0x10000000))),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  child: Text('VS', style: const TextStyle(
                    color: kColorMuted, fontWeight: FontWeight.w900,
                    fontSize: 10, letterSpacing: 1))),
                const Expanded(child: Divider(color: Color(0x10000000))),
              ]),
            ),

            // Team 2 row
            _TeamRow(
              names: match.team2,
              scores: match.scores.map((s) => s.length > 1 ? s[1] : 0).toList(),
              isWinner: w2, isDone: isDone,
            ),
          ]),
        ),
      ]),
    );
  }
}

class _TeamRow extends StatelessWidget {
  final List<String> names;
  final List<int> scores;
  final bool isWinner;
  final bool isDone;
  const _TeamRow({required this.names, required this.scores,
    required this.isWinner, required this.isDone});

  @override
  Widget build(BuildContext context) {
    return Container(
      clipBehavior: Clip.hardEdge,
      decoration: BoxDecoration(
        color: isWinner
            ? kColorEmerald.withOpacity(0.08)
            : const Color(0x05000000),
        borderRadius: BorderRadius.circular(12),
        boxShadow: isWinner ? [
          BoxShadow(color: kColorEmerald.withOpacity(0.12),
            blurRadius: 8, offset: const Offset(0, 2)),
        ] : [],
      ),
      child: IntrinsicHeight(
        child: Row(children: [
          // Left accent stripe for winner
          Container(
            width: 4,
            color: isWinner ? kColorEmerald : Colors.transparent,
          ),
          Expanded(child: Padding(
            padding: const EdgeInsets.fromLTRB(10, 10, 12, 10),
            child: Row(children: [
              if (isDone) SizedBox(
                width: 20,
                child: isWinner
                    ? const Icon(Icons.emoji_events_rounded, color: kColorAmber, size: 17)
                    : null),
              Expanded(child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: names.map((n) => Text(n,
                  style: TextStyle(
                    fontWeight: isWinner ? FontWeight.w800 : FontWeight.w400,
                    fontSize: isWinner ? 14.5 : 14,
                    color: isWinner ? kColorText : kColorMuted))).toList())),
              if (scores.isNotEmpty) ...[
                ...scores.map((s) => Padding(
                  padding: const EdgeInsets.only(left: 12),
                  child: Text('$s', style: TextStyle(
                    fontSize: isWinner ? 26 : 20,
                    fontWeight: FontWeight.w900,
                    color: isWinner ? kColorEmerald : kColorMuted)))),
              ],
            ]),
          )),
        ]),
      ),
    );
  }
}

// ── New Match Sheet ──────────────────────────────────────────────────────────

class _NewMatchSheet extends StatefulWidget {
  final String clanId;
  final VoidCallback onCreated;
  const _NewMatchSheet({required this.clanId, required this.onCreated});

  @override
  State<_NewMatchSheet> createState() => _NewMatchSheetState();
}

class _NewMatchSheetState extends State<_NewMatchSheet> {
  String _type = 'singles';
  final List<TextEditingController> _t1 = [TextEditingController()];
  final List<TextEditingController> _t2 = [TextEditingController()];
  bool _saving = false;

  void _setType(String t) {
    setState(() {
      _type = t;
      if (t == 'doubles') {
        if (_t1.length < 2) _t1.add(TextEditingController());
        if (_t2.length < 2) _t2.add(TextEditingController());
      } else {
        while (_t1.length > 1) _t1.removeLast().dispose();
        while (_t2.length > 1) _t2.removeLast().dispose();
      }
    });
  }

  @override
  void dispose() {
    for (final c in [..._t1, ..._t2]) c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.fromLTRB(24, 24, 24,
      MediaQuery.of(context).viewInsets.bottom + 24),
    child: SingleChildScrollView(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('Start New Match', style: TextStyle(
            fontSize: 18, fontWeight: FontWeight.w800, color: kColorText)),
          const SizedBox(height: 20),
          Row(children: [
            for (final t in ['singles', 'doubles'])
              Expanded(child: Padding(
                padding: EdgeInsets.only(right: t == 'singles' ? 6 : 0),
                child: GestureDetector(
                  onTap: () => _setType(t),
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    decoration: BoxDecoration(
                      color: _type == t
                          ? kColorPrimary.withOpacity(0.2)
                          : Colors.transparent,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(
                        color: _type == t ? kColorPrimary : const Color(0x18000000)),
                    ),
                    child: Text(t[0].toUpperCase() + t.substring(1),
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: _type == t ? kColorPrimary : kColorMuted,
                        fontWeight: FontWeight.w700)),
                  ),
                ),
              )),
          ]),
          const SizedBox(height: 20),
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(child: Column(children: [
              const Text('Team 1', style: TextStyle(
                color: kColorEmerald, fontSize: 12, fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              ..._t1.asMap().entries.map((e) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: TextField(
                  controller: e.value,
                  decoration: InputDecoration(
                    labelText: 'Player ${e.key + 1}',
                    isDense: true,
                  ),
                ),
              )),
            ])),
            const Padding(
              padding: EdgeInsets.fromLTRB(12, 32, 12, 0),
              child: Text('VS', style: TextStyle(
                color: kColorMuted, fontWeight: FontWeight.w800)),
            ),
            Expanded(child: Column(children: [
              const Text('Team 2', style: TextStyle(
                color: kColorRose, fontSize: 12, fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              ..._t2.asMap().entries.map((e) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: TextField(
                  controller: e.value,
                  decoration: InputDecoration(
                    labelText: 'Player ${e.key + 1}',
                    isDense: true,
                  ),
                ),
              )),
            ])),
          ]),
          const SizedBox(height: 20),
          ElevatedButton(
            onPressed: _saving ? null : _submit,
            child: _saving
                ? const SizedBox(width: 20, height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Text('Start Match'),
          ),
        ],
      ),
    ),
  );

  Future<void> _submit() async {
    final t1names = _t1.map((c) => c.text.trim()).where((s) => s.isNotEmpty).toList();
    final t2names = _t2.map((c) => c.text.trim()).where((s) => s.isNotEmpty).toList();
    if (t1names.isEmpty || t2names.isEmpty) return;

    setState(() => _saving = true);
    try {
      final res = await ApiService.instance.post('/api/clans/update_match', {
        'clanId': widget.clanId,
        'type': _type,
        'team1': t1names,
        'team2': t2names,
        'status': 'live',
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(matchSubmitMessage(res, confirmed: 'Match created'))));
      }
      if (mounted) Navigator.pop(context);
      widget.onCreated();
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }
}
