import 'package:flutter/material.dart';
import '../../core/theme.dart';
import '../../models/progress_model.dart';
import '../../services/analytics.dart';
import '../../services/api_service.dart';
import '../../widgets/loading_screen.dart';
import '../../widgets/rating_widgets.dart';

/// Server limit per request (Sportify-web app/api/clans/matches/bulk).
const kMaxBulkResults = 60;

class BulkMember {
  final String userId;
  final String name;
  const BulkMember(this.userId, this.name);
}

/// One result row being entered. Players are [team1] vs [team2], one each
/// for singles, two each for doubles.
class BulkRow {
  static int _nextKey = 0;
  final int key = _nextKey++;
  String type;
  List<String?> team1;
  List<String?> team2;
  final TextEditingController score;
  String? error;

  BulkRow({this.type = 'singles', List<String?>? team1, List<String?>? team2, String score = ''})
      : team1 = team1 ?? List<String?>.filled(type == 'doubles' ? 2 : 1, null),
        team2 = team2 ?? List<String?>.filled(type == 'doubles' ? 2 : 1, null),
        score = TextEditingController(text: score);

  List<String?> get players => [...team1, ...team2];
  bool get isBlank => players.every((p) => p == null) && score.text.trim().isEmpty;

  void setType(String t) {
    if (t == type) return;
    type = t;
    final n = t == 'doubles' ? 2 : 1;
    List<String?> resize(List<String?> l) =>
        List<String?>.generate(n, (i) => i < l.length ? l[i] : null);
    team1 = resize(team1);
    team2 = resize(team2);
  }

  /// A new row with the same players and type (next game in a rotation).
  BulkRow copyPlayers() => BulkRow(type: type, team1: [...team1], team2: [...team2]);

  /// Client-side check; null when the row is ready to send.
  String? validate() {
    if (players.any((p) => p == null)) {
      return type == 'singles' ? 'Pick both players' : 'Pick all four players';
    }
    if (players.toSet().length != players.length) {
      return 'A player can only appear once in a match';
    }
    final games = parseBulkScore(score.text);
    if (games.isEmpty) return 'Enter the score, e.g. 21-15, 21-18';
    var w1 = 0, w2 = 0;
    for (final g in games) {
      if (g.$1 > g.$2) w1++;
      if (g.$2 > g.$1) w2++;
    }
    if (w1 == w2) return 'The score has no winner';
    return null;
  }

  Map<String, dynamic> toJson() {
    final s = normalizeBulkScore(score.text);
    return type == 'singles'
        ? {'matchType': 'singles', 'player1': team1[0], 'player2': team2[0], 'score': s}
        : {
            'matchType': 'doubles',
            'team1Player1': team1[0],
            'team1Player2': team1[1],
            'team2Player1': team2[0],
            'team2Player2': team2[1],
            'score': s,
          };
  }

  void dispose() => score.dispose();
}

final _gameRe = RegExp(r'(\d+)\s*[-–—:]\s*(\d+)');

/// Games in a typed score. Accepts "21-15, 21-18", "21-15 21-18", "21:15".
List<(int, int)> parseBulkScore(String raw) => _gameRe
    .allMatches(raw)
    .map((m) => (int.parse(m.group(1)!), int.parse(m.group(2)!)))
    .toList();

/// The score in the server's format: "21-15, 21-18".
String normalizeBulkScore(String raw) =>
    parseBulkScore(raw).map((g) => '${g.$1}-${g.$2}').join(', ');

/// Strips the server's "Match 3: " prefix from a row error.
String stripRowPrefix(String message) =>
    message.replaceFirst(RegExp(r'^Match \d+:\s*'), '');

// ── Screen ───────────────────────────────────────────────────────────────────

/// Coach / clan admin / academy owner records a class's results in one go.
/// Pops with `true` once something was saved, so the caller can refresh.
class BulkResultsScreen extends StatefulWidget {
  final String clanId;
  final String? clanName;
  const BulkResultsScreen({super.key, required this.clanId, this.clanName});

  @override
  State<BulkResultsScreen> createState() => _BulkResultsScreenState();
}

class _BulkResultsScreenState extends State<BulkResultsScreen> {
  List<BulkMember> _members = [];
  Map<String, String> _names = {};
  bool _loading = true;
  String? _loadError;

  final List<BulkRow> _rows = [BulkRow()];
  bool _saving = false;
  String? _banner;
  bool _savedAny = false;

  /// After a successful save: the rows that were sent and the server results.
  List<({BulkRow row, Map<String, int> changes})>? _summary;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final r in _rows) {
      r.dispose();
    }
    for (final s in _summary ?? const <({BulkRow row, Map<String, int> changes})>[]) {
      s.row.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _loadError = null; });
    try {
      final data = await ApiService.instance.get(
        '/api/clans/get_clanmembers',
        query: {'clanId': widget.clanId},
      );
      final raw = data['members'] as List? ?? data['data'] as List? ?? [];
      final members = raw
          .whereType<Map>()
          .map((m) => BulkMember(m['user_id']?.toString() ?? '', m['name']?.toString() ?? 'Player'))
          .where((m) => m.userId.isNotEmpty)
          .toList()
        ..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
      if (!mounted) return;
      setState(() {
        _members = members;
        _names = {for (final m in members) m.userId: m.name};
        _loading = false;
      });
    } catch (e) {
      if (mounted) setState(() { _loadError = e.toString(); _loading = false; });
    }
  }

  bool get _dirty => _summary == null && _rows.any((r) => !r.isBlank);

  /// Disposes a row's controller after the frame its TextField leaves.
  void _retire(BulkRow r) =>
      WidgetsBinding.instance.addPostFrameCallback((_) => r.dispose());

  void _addRow(String type) {
    if (_rows.length >= kMaxBulkResults) return;
    setState(() => _rows.add(BulkRow(type: type)));
  }

  void _duplicateRow(int i) {
    if (_rows.length >= kMaxBulkResults) return;
    setState(() => _rows.insert(i + 1, _rows[i].copyPlayers()));
  }

  void _removeRow(int i) {
    setState(() {
      _retire(_rows.removeAt(i));
      if (_rows.isEmpty) _rows.add(BulkRow());
    });
  }

  Future<void> _pickPlayer(BulkRow row, bool team1, int slot) async {
    final current = (team1 ? row.team1 : row.team2)[slot];
    final taken = row.players.whereType<String>().where((p) => p != current).toSet();
    final picked = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _PlayerPickerSheet(members: _members, taken: taken, selected: current),
    );
    if (picked == null || !mounted) return;
    setState(() {
      (team1 ? row.team1 : row.team2)[slot] = picked.isEmpty ? null : picked;
      row.error = null;
    });
  }

  Future<void> _save() async {
    FocusScope.of(context).unfocus();
    // Drop untouched rows at the end, keep the rest for validation
    final rows = _rows.where((r) => !r.isBlank).toList();
    if (rows.isEmpty) {
      setState(() => _banner = 'Add at least one result');
      return;
    }
    var bad = 0;
    setState(() {
      _banner = null;
      for (final r in rows) {
        r.error = r.validate();
        if (r.error != null) bad++;
      }
    });
    if (bad > 0) {
      setState(() => _banner = bad == 1
          ? '1 result needs fixing before saving'
          : '$bad results need fixing before saving');
      return;
    }

    setState(() => _saving = true);
    try {
      final res = await ApiService.instance
          .recordBulkMatches(widget.clanId, rows.map((r) => r.toJson()).toList());
      final results = (res['results'] as List? ?? []).whereType<Map>().toList();
      Analytics.instance.track('bulk_results_recorded', {
        'count': rows.length,
        'singles': rows.where((r) => r.type == 'singles').length,
        'doubles': rows.where((r) => r.type == 'doubles').length,
      });
      if (!mounted) return;
      setState(() {
        _savedAny = true;
        _summary = [
          for (var i = 0; i < rows.length; i++)
            (
              row: rows[i],
              changes: i < results.length
                  ? parseRatingChanges(results[i]['ratingChanges'])
                  : const <String, int>{},
            ),
        ];
        // Sent rows now belong to the summary; free the blank leftovers
        _rows.where((r) => !rows.contains(r)).forEach(_retire);
        _rows.clear();
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      final idx = e.index;
      setState(() {
        if (idx != null && idx >= 0 && idx < rows.length) {
          rows[idx].error = stripRowPrefix(e.message);
          _banner = 'Nothing was saved. Fix match ${_rows.indexOf(rows[idx]) + 1} and try again.';
        } else if (e.statusCode == 403) {
          _banner = "You don't have permission to record results here";
        } else {
          _banner = 'Nothing was saved: ${e.message}';
        }
      });
    } catch (e) {
      if (mounted) setState(() => _banner = 'Nothing was saved: $e');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _recordMore() {
    setState(() {
      _summary?.forEach((s) => _retire(s.row));
      _summary = null;
      _banner = null;
      _rows.add(BulkRow());
    });
  }

  Future<bool> _confirmDiscard() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Discard results?'),
        content: const Text("The results you entered haven't been saved."),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Keep editing')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Discard')),
        ],
      ),
    );
    return ok == true;
  }

  @override
  Widget build(BuildContext context) {
    return PopScope<bool>(
      canPop: !_dirty && !_saving,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop || _saving) return;
        final nav = Navigator.of(context);
        if (await _confirmDiscard() && mounted) nav.pop(_savedAny);
      },
      child: Scaffold(
        backgroundColor: kColorBg,
        appBar: AppBar(
          leading: BackButton(onPressed: () => Navigator.maybePop(context, _savedAny)),
          title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Record results'),
            if (widget.clanName != null && widget.clanName!.isNotEmpty)
              Text(widget.clanName!,
                  style: const TextStyle(color: kColorMuted, fontSize: 12, fontWeight: FontWeight.w500)),
          ]),
        ),
        body: _loading
            ? const CenteredLoader()
            : _loadError != null
                ? ErrorView(message: _loadError!, onRetry: _load)
                : _summary != null
                    ? _buildSummary()
                    : _members.length < 2
                        ? const EmptyView(
                            message: 'This batch needs at least two members to record results',
                            icon: Icons.group_add_outlined)
                        : _buildEditor(),
        bottomNavigationBar: (!_loading && _loadError == null && _members.length >= 2)
            ? _buildBottomBar()
            : null,
      ),
    );
  }

  Widget _buildEditor() {
    return ListView(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 24),
      children: [
        if (_banner != null) _Banner(message: _banner!),
        for (var i = 0; i < _rows.length; i++)
          _RowCard(
            key: ValueKey(_rows[i].key),
            index: i,
            row: _rows[i],
            names: _names,
            onType: (t) => setState(() { _rows[i].setType(t); _rows[i].error = null; }),
            onPick: (team1, slot) => _pickPlayer(_rows[i], team1, slot),
            onRemove: () => _removeRow(i),
            onDuplicate: _rows.length < kMaxBulkResults ? () => _duplicateRow(i) : null,
            onScoreChanged: () { if (_rows[i].error != null) setState(() => _rows[i].error = null); },
          ),
        Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Row(children: [
            Expanded(child: OutlinedButton.icon(
              onPressed: _rows.length < kMaxBulkResults ? () => _addRow('singles') : null,
              icon: const Icon(Icons.person_add_alt_rounded, size: 18),
              label: const Text('Singles'),
            )),
            const SizedBox(width: 10),
            Expanded(child: OutlinedButton.icon(
              onPressed: _rows.length < kMaxBulkResults ? () => _addRow('doubles') : null,
              icon: const Icon(Icons.group_add_rounded, size: 18),
              label: const Text('Doubles'),
            )),
          ]),
        ),
        if (_rows.length >= kMaxBulkResults)
          const Padding(
            padding: EdgeInsets.only(top: 8),
            child: Text('At most $kMaxBulkResults results at a time. Save these, then record more.',
                style: TextStyle(color: kColorMuted, fontSize: 12)),
          ),
      ],
    );
  }

  Widget? _buildBottomBar() {
    if (_summary != null) {
      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: Row(children: [
            Expanded(child: OutlinedButton(onPressed: _recordMore, child: const Text('Record more'))),
            const SizedBox(width: 10),
            Expanded(child: ElevatedButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Done'),
            )),
          ]),
        ),
      );
    }
    final count = _rows.where((r) => !r.isBlank).length;
    return SafeArea(
      child: Container(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
        decoration: const BoxDecoration(
          color: kColorSurface,
          boxShadow: [BoxShadow(color: Color(0x14000000), blurRadius: 8, offset: Offset(0, -2))],
        ),
        child: ElevatedButton(
          onPressed: _saving || count == 0 ? null : _save,
          child: _saving
              ? const SizedBox(width: 20, height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : Text(count <= 1 ? 'Save result' : 'Save all $count results'),
        ),
      ),
    );
  }

  Widget _buildSummary() {
    final s = _summary!;
    String side(List<String?> ids) => ids.map((id) => _names[id] ?? 'Player').join(' & ');
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: kColorEmerald.withValues(alpha: 0.10),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: kColorEmerald.withValues(alpha: 0.3)),
          ),
          child: Row(children: [
            const Icon(Icons.check_circle_rounded, color: kColorEmerald, size: 28),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(s.length == 1 ? '1 result recorded' : '${s.length} results recorded',
                  style: const TextStyle(color: kColorText, fontWeight: FontWeight.w800, fontSize: 16)),
              const SizedBox(height: 2),
              const Text('Confirmed and counted. Players have been notified.',
                  style: TextStyle(color: kColorMuted, fontSize: 12)),
            ])),
          ]),
        ),
        const SizedBox(height: 14),
        for (var i = 0; i < s.length; i++)
          Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: kColorSurface,
              borderRadius: BorderRadius.circular(14),
              boxShadow: const [BoxShadow(color: Color(0x0A000000), blurRadius: 6, offset: Offset(0, 2))],
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Text('${i + 1}. ${s[i].row.type == 'doubles' ? 'Doubles' : 'Singles'}',
                    style: const TextStyle(color: kColorMuted, fontSize: 11, fontWeight: FontWeight.w700)),
                const Spacer(),
                Text(normalizeBulkScore(s[i].row.score.text),
                    style: const TextStyle(color: kColorText, fontSize: 13, fontWeight: FontWeight.w800)),
              ]),
              const SizedBox(height: 4),
              Text('${side(s[i].row.team1)}  vs  ${side(s[i].row.team2)}',
                  style: const TextStyle(color: kColorText, fontSize: 13, fontWeight: FontWeight.w600)),
              if (s[i].changes.isNotEmpty) ...[
                const SizedBox(height: 8),
                RatingChangeRow(
                  changes: s[i].changes,
                  ids: s[i].row.players.whereType<String>().toList(),
                  names: s[i].row.players.map((id) => _names[id] ?? 'Player').toList(),
                ),
              ],
            ]),
          ),
      ],
    );
  }
}

// ── Row card ─────────────────────────────────────────────────────────────────

class _RowCard extends StatelessWidget {
  final int index;
  final BulkRow row;
  final Map<String, String> names;
  final ValueChanged<String> onType;
  final void Function(bool team1, int slot) onPick;
  final VoidCallback onRemove;
  final VoidCallback? onDuplicate;
  final VoidCallback onScoreChanged;

  const _RowCard({
    super.key,
    required this.index,
    required this.row,
    required this.names,
    required this.onType,
    required this.onPick,
    required this.onRemove,
    required this.onDuplicate,
    required this.onScoreChanged,
  });

  @override
  Widget build(BuildContext context) {
    final hasError = row.error != null;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.fromLTRB(12, 8, 4, 12),
      decoration: BoxDecoration(
        color: kColorSurface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
            color: hasError ? kColorRose.withValues(alpha: 0.6) : kColorMuted.withValues(alpha: 0.10),
            width: hasError ? 1.5 : 1),
        boxShadow: const [BoxShadow(color: Color(0x0A000000), blurRadius: 8, offset: Offset(0, 2))],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Text('Match ${index + 1}',
              style: const TextStyle(color: kColorText, fontWeight: FontWeight.w800, fontSize: 14)),
          const SizedBox(width: 10),
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'singles', label: Text('Singles')),
              ButtonSegment(value: 'doubles', label: Text('Doubles')),
            ],
            selected: {row.type},
            showSelectedIcon: false,
            style: const ButtonStyle(visualDensity: VisualDensity.compact),
            onSelectionChanged: (s) => onType(s.first),
          ),
          const Spacer(),
          IconButton(
            tooltip: 'Same players again',
            onPressed: onDuplicate,
            icon: const Icon(Icons.copy_rounded, size: 18, color: kColorMuted),
          ),
          IconButton(
            tooltip: 'Remove',
            onPressed: onRemove,
            icon: const Icon(Icons.delete_outline_rounded, size: 20, color: kColorRose),
          ),
        ]),
        const SizedBox(height: 6),
        Padding(
          padding: const EdgeInsets.only(right: 8),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            _side(true),
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 4),
              child: Text('vs', textAlign: TextAlign.center,
                  style: TextStyle(color: kColorMuted, fontWeight: FontWeight.w800, fontSize: 11)),
            ),
            _side(false),
            const SizedBox(height: 10),
            TextField(
              controller: row.score,
              autocorrect: false,
              enableSuggestions: false,
              keyboardType: TextInputType.text,
              textInputAction: TextInputAction.done,
              onChanged: (_) => onScoreChanged(),
              decoration: const InputDecoration(
                labelText: 'Score',
                hintText: '21-15, 21-18',
                isDense: true,
                prefixIcon: Icon(Icons.scoreboard_outlined, size: 18),
              ),
            ),
            if (hasError) ...[
              const SizedBox(height: 6),
              Row(children: [
                const Icon(Icons.error_outline_rounded, color: kColorRose, size: 16),
                const SizedBox(width: 6),
                Expanded(child: Text(row.error!,
                    style: const TextStyle(color: kColorRose, fontSize: 12, fontWeight: FontWeight.w600))),
              ]),
            ],
          ]),
        ),
      ]),
    );
  }

  Widget _side(bool team1) {
    final ids = team1 ? row.team1 : row.team2;
    return Row(children: [
      for (var i = 0; i < ids.length; i++) ...[
        if (i > 0) const SizedBox(width: 8),
        Expanded(child: _Slot(
          name: ids[i] == null ? null : names[ids[i]] ?? 'Player',
          hint: row.type == 'singles' ? 'Player ${team1 ? 1 : 2}' : 'Team ${team1 ? 1 : 2} player',
          color: team1 ? kColorEmerald : kColorPrimary,
          onTap: () => onPick(team1, i),
        )),
      ],
    ]);
  }
}

class _Slot extends StatelessWidget {
  final String? name;
  final String hint;
  final Color color;
  final VoidCallback onTap;
  const _Slot({required this.name, required this.hint, required this.color, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final empty = name == null;
    return Material(
      color: empty ? const Color(0xFFF8FAFF) : color.withValues(alpha: 0.08),
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Container(
          constraints: const BoxConstraints(minHeight: 48),
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: empty ? const Color(0x18000000) : color.withValues(alpha: 0.4)),
          ),
          child: Row(children: [
            Icon(empty ? Icons.person_add_alt_1_outlined : Icons.person_rounded,
                size: 18, color: empty ? kColorMuted : color),
            const SizedBox(width: 6),
            Expanded(child: Text(name ?? hint,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                    color: empty ? kColorMuted : kColorText,
                    fontSize: 13,
                    fontWeight: empty ? FontWeight.w500 : FontWeight.w700))),
          ]),
        ),
      ),
    );
  }
}

class _Banner extends StatelessWidget {
  final String message;
  const _Banner({required this.message});

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: kColorRose.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: kColorRose.withValues(alpha: 0.3)),
        ),
        child: Row(children: [
          const Icon(Icons.warning_amber_rounded, color: kColorRose, size: 18),
          const SizedBox(width: 8),
          Expanded(child: Text(message,
              style: const TextStyle(color: kColorRose, fontSize: 13, fontWeight: FontWeight.w600))),
        ]),
      );
}

// ── Player picker ────────────────────────────────────────────────────────────

class _PlayerPickerSheet extends StatefulWidget {
  final List<BulkMember> members;
  final Set<String> taken;
  final String? selected;
  const _PlayerPickerSheet({required this.members, required this.taken, this.selected});

  @override
  State<_PlayerPickerSheet> createState() => _PlayerPickerSheetState();
}

class _PlayerPickerSheetState extends State<_PlayerPickerSheet> {
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final list = _q.isEmpty
        ? widget.members
        : widget.members.where((m) => m.name.toLowerCase().contains(_q.toLowerCase())).toList();
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: SizedBox(
          height: MediaQuery.of(context).size.height * 0.7,
          child: Column(children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: TextField(
                autofocus: widget.members.length > 12,
                onChanged: (v) => setState(() => _q = v.trim()),
                decoration: const InputDecoration(
                  hintText: 'Search players',
                  prefixIcon: Icon(Icons.search, size: 18),
                  isDense: true,
                ),
              ),
            ),
            if (widget.selected != null)
              ListTile(
                leading: const Icon(Icons.clear_rounded, color: kColorRose),
                title: const Text('Clear', style: TextStyle(color: kColorRose)),
                onTap: () => Navigator.pop(context, ''),
              ),
            Expanded(
              child: list.isEmpty
                  ? const Center(child: Text('No players found', style: TextStyle(color: kColorMuted)))
                  : ListView.builder(
                      itemCount: list.length,
                      itemBuilder: (_, i) {
                        final m = list[i];
                        final taken = widget.taken.contains(m.userId);
                        final isSel = m.userId == widget.selected;
                        return ListTile(
                          enabled: !taken,
                          leading: CircleAvatar(
                            radius: 16,
                            backgroundColor: kColorPrimary.withValues(alpha: 0.12),
                            child: Text(m.name.isEmpty ? '?' : m.name[0].toUpperCase(),
                                style: const TextStyle(color: kColorPrimary, fontWeight: FontWeight.w700)),
                          ),
                          title: Text(m.name),
                          subtitle: taken ? const Text('Already in this match') : null,
                          trailing: isSel ? const Icon(Icons.check_rounded, color: kColorEmerald) : null,
                          onTap: () => Navigator.pop(context, m.userId),
                        );
                      },
                    ),
            ),
          ]),
        ),
      ),
    );
  }
}
