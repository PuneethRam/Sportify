import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../core/theme.dart';
import '../../services/api_service.dart';
import '../../widgets/loading_screen.dart';
import 'create_series_screen.dart';
import 'series_detail_screen.dart';

// ── Model ────────────────────────────────────────────────────────────────────

class _Series {
  final int seriesId;
  final String seriesType;
  final String? team1Name;
  final String? team2Name;
  final int totalMatches;
  final String? winnerTeam;
  final String startDate;

  const _Series({
    required this.seriesId,
    required this.seriesType,
    this.team1Name,
    this.team2Name,
    required this.totalMatches,
    this.winnerTeam,
    required this.startDate,
  });

  factory _Series.fromJson(Map<String, dynamic> j) => _Series(
        seriesId: j['series_id'] as int,
        seriesType: j['series_type'] as String? ?? 'singles',
        team1Name: j['team1_name'] as String?,
        team2Name: j['team2_name'] as String?,
        totalMatches: j['total_matches'] as int? ?? 0,
        winnerTeam: j['winner_team'] as String?,
        startDate: j['start_date'] as String? ?? '',
      );

  bool get isCompleted => winnerTeam != null;

  String get title => (team1Name != null && team2Name != null)
      ? '$team1Name vs $team2Name'
      : 'Series #$seriesId';
}

// ── Screen ───────────────────────────────────────────────────────────────────

class SeriesScreen extends StatefulWidget {
  final String clanId;
  final bool isAdmin;
  const SeriesScreen({super.key, required this.clanId, required this.isAdmin});

  @override
  State<SeriesScreen> createState() => _SeriesScreenState();
}

class _SeriesScreenState extends State<SeriesScreen>
    with AutomaticKeepAliveClientMixin {
  List<_Series> _series = [];
  bool _loading = true;
  String? _error;
  String _statusFilter = 'all';
  String _typeFilter = 'all';

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await ApiService.instance.get(
        '/api/clans/series/get_series',
        query: {'id': widget.clanId},
      );
      setState(() {
        _series = (data['data'] as List? ?? [])
            .map((e) => _Series.fromJson(e as Map<String, dynamic>))
            .toList();
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _deleteSeries(int seriesId) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Series'),
        content: const Text('Delete this series and all its matches?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete', style: TextStyle(color: kColorRose)),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ApiService.instance.delete(
        '/api/clans/series/delete_series?seriesId=$seriesId&clanId=${widget.clanId}',
      );
      setState(() => _series.removeWhere((s) => s.seriesId == seriesId));
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.toString())));
      }
    }
  }

  List<_Series> get _filtered => _series.where((s) {
        final statusOk = _statusFilter == 'all' ||
            (_statusFilter == 'active' && !s.isCompleted) ||
            (_statusFilter == 'completed' && s.isCompleted);
        final typeOk = _typeFilter == 'all' || s.seriesType == _typeFilter;
        return statusOk && typeOk;
      }).toList();

  @override
  Widget build(BuildContext context) {
    super.build(context);
    if (_loading) return const CenteredLoader();
    if (_error != null) return ErrorView(message: _error!, onRetry: _load);

    final activeCount = _series.where((s) => !s.isCompleted).length;
    final completedCount = _series.where((s) => s.isCompleted).length;
    final filtered = _filtered;

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Stats row
          if (_series.isNotEmpty) ...[
            Row(children: [
              Expanded(
                  child: _StatCard(
                      label: 'In Progress',
                      count: activeCount,
                      color: kColorPrimary)),
              const SizedBox(width: 10),
              Expanded(
                  child: _StatCard(
                      label: 'Completed',
                      count: completedCount,
                      color: kColorEmerald)),
            ]),
            const SizedBox(height: 14),
          ],

          // Status filter chips
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(children: [
              for (final item in [
                ('all', 'All'),
                ('active', 'In Progress'),
                ('completed', 'Completed'),
              ])
                Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: FilterChip(
                    label: Text(item.$2),
                    selected: _statusFilter == item.$1,
                    onSelected: (_) =>
                        setState(() => _statusFilter = item.$1),
                  ),
                ),
            ]),
          ),
          const SizedBox(height: 6),

          // Type filter chips
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(children: [
              for (final item in [
                ('all', 'All Types'),
                ('singles', 'Singles'),
                ('doubles', 'Doubles'),
              ])
                Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: FilterChip(
                    label: Text(item.$2),
                    selected: _typeFilter == item.$1,
                    onSelected: (_) =>
                        setState(() => _typeFilter = item.$1),
                  ),
                ),
            ]),
          ),
          const SizedBox(height: 12),

          // Admin CTA
          if (widget.isAdmin)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: ElevatedButton.icon(
                onPressed: () async {
                  final result = await Navigator.push<bool>(
                    context,
                    MaterialPageRoute(
                      builder: (_) =>
                          CreateSeriesScreen(clanId: widget.clanId),
                    ),
                  );
                  if (result == true) _load();
                },
                icon: const Icon(Icons.add, size: 18),
                label: const Text('Create New Series'),
              ),
            ),

          // Series list or empty state
          if (filtered.isEmpty)
            EmptyView(
              message: _statusFilter != 'all' || _typeFilter != 'all'
                  ? 'Try changing your filter settings'
                  : "This clan doesn't have any series yet",
              icon: Icons.shield_outlined,
            )
          else
            for (final s in filtered)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _SeriesCard(
                  series: s,
                  isAdmin: widget.isAdmin,
                  onDelete: _deleteSeries,
                  onTap: () async {
                    await Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => SeriesDetailScreen(
                          clanId: widget.clanId,
                          seriesId: s.seriesId.toString(),
                        ),
                      ),
                    );
                    _load();
                  },
                ),
              ),
        ],
      ),
    );
  }
}

// ── Stat card ────────────────────────────────────────────────────────────────

class _StatCard extends StatelessWidget {
  final String label;
  final int count;
  final Color color;
  const _StatCard(
      {required this.label, required this.count, required this.color});

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          color: color.withOpacity(0.08),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color.withOpacity(0.2)),
        ),
        child: Column(children: [
          Text('$count',
              style: TextStyle(
                  color: color,
                  fontSize: 26,
                  fontWeight: FontWeight.w900)),
          const SizedBox(height: 2),
          Text(label,
              style: const TextStyle(
                  color: kColorMuted,
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.5)),
        ]),
      );
}

// ── Series card ───────────────────────────────────────────────────────────────

class _SeriesCard extends StatelessWidget {
  final _Series series;
  final bool isAdmin;
  final ValueChanged<int> onDelete;
  final VoidCallback onTap;

  const _SeriesCard({
    required this.series,
    required this.isAdmin,
    required this.onDelete,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final color = series.isCompleted ? kColorEmerald : kColorPrimary;
    String dateStr = '';
    final d = DateTime.tryParse(series.startDate);
    if (d != null) dateStr = DateFormat('MMM d, yyyy').format(d);

    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: color.withOpacity(0.05),
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(color: color.withOpacity(0.10), blurRadius: 10, offset: const Offset(0, 3)),
            const BoxShadow(color: Color(0x04000000), blurRadius: 2),
          ],
        ),
        clipBehavior: Clip.hardEdge,
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Left accent bar
              Container(width: 3, color: color),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(12, 14, 14, 14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // Type icon
                          Container(
                            width: 36,
                            height: 36,
                            decoration: BoxDecoration(
                              color: color,
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Icon(
                              series.seriesType == 'singles'
                                  ? Icons.person_rounded
                                  : Icons.people_rounded,
                              color: kColorSurface,
                              size: 18,
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(series.title,
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w800,
                                        fontSize: 15,
                                        color: kColorText),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis),
                                Text(
                                  '${series.seriesType[0].toUpperCase()}${series.seriesType.substring(1)} Series',
                                  style: const TextStyle(
                                      color: kColorMuted, fontSize: 11),
                                ),
                              ],
                            ),
                          ),
                          // Status badge + delete
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 8, vertical: 3),
                                decoration: BoxDecoration(
                                  color: color.withOpacity(0.14),
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    if (!series.isCompleted)
                                      Container(
                                        width: 5,
                                        height: 5,
                                        margin:
                                            const EdgeInsets.only(right: 4),
                                        decoration: BoxDecoration(
                                            color: color,
                                            shape: BoxShape.circle),
                                      ),
                                    Text(
                                      series.isCompleted
                                          ? 'Completed'
                                          : 'In Progress',
                                      style: TextStyle(
                                          color: color,
                                          fontSize: 10,
                                          fontWeight: FontWeight.w700),
                                    ),
                                  ],
                                ),
                              ),
                              if (isAdmin)
                                GestureDetector(
                                  behavior: HitTestBehavior.opaque,
                                  onTap: () => onDelete(series.seriesId),
                                  child: Padding(
                                    padding: const EdgeInsets.only(top: 6),
                                    child: Icon(
                                        Icons.delete_outline_rounded,
                                        color: kColorMuted,
                                        size: 18),
                                  ),
                                ),
                            ],
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Divider(color: color.withOpacity(0.2), height: 1),
                      const SizedBox(height: 10),
                      // Footer row
                      Row(children: [
                        if (series.isCompleted && series.winnerTeam != null) ...[
                          const Icon(Icons.emoji_events_rounded,
                              color: kColorAmber, size: 14),
                          const SizedBox(width: 4),
                          Text(series.winnerTeam!,
                              style: TextStyle(
                                  color: color,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600)),
                        ] else ...[
                          Icon(Icons.trending_up_rounded,
                              color: kColorMuted, size: 14),
                          const SizedBox(width: 4),
                          Text(
                            '${series.totalMatches} match${series.totalMatches != 1 ? "es" : ""}',
                            style: const TextStyle(
                                color: kColorMuted, fontSize: 12),
                          ),
                        ],
                        const Spacer(),
                        const Icon(Icons.calendar_today_rounded,
                            color: kColorMuted, size: 11),
                        const SizedBox(width: 4),
                        Text(dateStr,
                            style: const TextStyle(
                                color: kColorMuted, fontSize: 11)),
                        const SizedBox(width: 6),
                        Icon(Icons.chevron_right_rounded,
                            color: color, size: 16),
                      ]),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
