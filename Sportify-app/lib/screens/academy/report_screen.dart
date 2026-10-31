import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';
import '../../core/theme.dart';
import '../../services/api_service.dart';
import '../../widgets/loading_screen.dart';

class ReportScreen extends StatefulWidget {
  final String userId;
  final String batchId;
  final String studentName;
  const ReportScreen({
    super.key,
    required this.userId,
    required this.batchId,
    required this.studentName,
  });

  @override
  State<ReportScreen> createState() => _ReportScreenState();
}

class _ReportScreenState extends State<ReportScreen> {
  Map<String, dynamic>? _stats;
  Map<String, dynamic>? _tournaments;
  Map<String, dynamic>? _attendance;
  List<Map<String, dynamic>> _recent = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final data = await ApiService.instance.get(
        '/api/organisations/student-stats',
        query: {'userId': widget.userId, 'batchId': widget.batchId},
      );
      setState(() {
        _stats       = data['stats'] as Map<String, dynamic>?;
        _tournaments = data['tournaments'] as Map<String, dynamic>?;
        _attendance  = data['attendance'] as Map<String, dynamic>?;
        _recent      = List<Map<String, dynamic>>.from(data['recentAttendance'] ?? []);
        _loading = false;
      });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  void _share() {
    if (_stats == null) return;
    final name    = _stats!['name']?.toString() ?? widget.studentName;
    final played  = (_stats!['matchesplayed'] as num?)?.toInt() ?? 0;
    final won     = (_stats!['matcheswon'] as num?)?.toInt() ?? 0;
    final points  = (_stats!['clan_points'] as num?)?.toDouble() ?? 0;
    final attTotal   = (_attendance?['totalSessions'] as num?)?.toInt() ?? 0;
    final attPresent = (_attendance?['present'] as num?)?.toInt() ?? 0;
    final attLate    = (_attendance?['late'] as num?)?.toInt() ?? 0;
    final attRate    = attTotal > 0 ? ((attPresent + attLate) / attTotal * 100).round() : 0;
    final winRate = played > 0 ? (won / played * 100).round() : 0;

    final today = DateTime.now();
    final dateStr = '${today.day}/${today.month}/${today.year}';

    final text = '''Progress Report — $name
Generated: $dateStr

Match Stats
• Matches Played: $played
• Wins: $won  Losses: ${played - won}
• Win Rate: $winRate%
• Total Points: ${points.toStringAsFixed(1)}

Attendance
• Attendance Rate: $attRate%
• Present: $attPresent  Late: $attLate  Absent: ${(_attendance?['absent'] as num?)?.toInt() ?? 0}
• Total Sessions: $attTotal''';

    Share.share(text, subject: 'Progress Report — $name');
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return Scaffold(appBar: AppBar(title: const Text('Progress Report')), body: const CenteredLoader());
    if (_error != null || _stats == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Progress Report')),
        body: ErrorView(message: _error ?? 'Not found', onRetry: _load),
      );
    }

    final stats = _stats!;
    final name   = stats['name']?.toString() ?? widget.studentName;
    final played = (stats['matchesplayed'] as num?)?.toInt() ?? 0;
    final won    = (stats['matcheswon'] as num?)?.toInt() ?? 0;
    final lost   = (stats['matcheslost'] as num?)?.toInt() ?? 0;
    final points = (stats['clan_points'] as num?)?.toDouble() ?? 0;
    final winRate = played > 0 ? (won / played * 100).round() : 0;

    final attTotal   = (_attendance?['totalSessions'] as num?)?.toInt() ?? 0;
    final attPresent = (_attendance?['present'] as num?)?.toInt() ?? 0;
    final attLate    = (_attendance?['late'] as num?)?.toInt() ?? 0;
    final attAbsent  = (_attendance?['absent'] as num?)?.toInt() ?? 0;
    final attRate    = attTotal > 0 ? ((attPresent + attLate) / attTotal * 100).round() : 0;

    final today  = DateTime.now();
    final dateStr = '${today.day}/${today.month}/${today.year}';

    Color winColor  = winRate >= 70 ? kColorEmerald : winRate >= 50 ? kColorPrimary : kColorRose;
    Color attColor  = attRate >= 75 ? kColorEmerald : attRate >= 50 ? kColorAmber : kColorRose;

    final initials = name.trim().split(' ')
        .where((p) => p.isNotEmpty).map((p) => p[0]).take(2).join().toUpperCase();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Progress Report'),
        actions: [
          IconButton(
            icon: const Icon(Icons.share_outlined),
            onPressed: _share,
            tooltip: 'Share',
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [

          // Hero card
          Container(
            decoration: BoxDecoration(
              color: kColorSurface,
              borderRadius: BorderRadius.circular(18),
              boxShadow: const [BoxShadow(color: Color(0x0A000000), blurRadius: 8, offset: Offset(0, 2))],
            ),
            clipBehavior: Clip.hardEdge,
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Container(height: 4,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [kColorEmerald, kColorPrimary]))),
              Padding(
                padding: const EdgeInsets.all(16),
                child: Column(children: [
                  Row(children: [
                    Container(
                      width: 64, height: 64,
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [kColorEmerald, kColorPrimary]),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      alignment: Alignment.center,
                      child: Text(initials, style: const TextStyle(
                        color: Colors.white, fontWeight: FontWeight.w900, fontSize: 24)),
                    ),
                    const SizedBox(width: 14),
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(name, style: const TextStyle(
                        fontWeight: FontWeight.w800, fontSize: 18, color: kColorText)),
                      Text('Report · $dateStr',
                        style: const TextStyle(fontSize: 12, color: kColorMuted)),
                    ])),
                  ]),
                  const SizedBox(height: 16),
                  const Divider(color: Color(0x10000000)),
                  const SizedBox(height: 12),
                  // Summary row
                  Row(children: [
                    _SummaryItem(label: 'Points', value: points.toStringAsFixed(1), color: kColorAmber),
                    _SummaryDivider(),
                    _SummaryItem(label: 'Win Rate', value: '$winRate%', color: winColor),
                    _SummaryDivider(),
                    _SummaryItem(label: 'Attendance', value: '$attRate%', color: attColor),
                  ]),
                ]),
              ),
            ]),
          ),
          const SizedBox(height: 16),

          // Attendance section
          if (attTotal > 0) ...[
            _Section(
              label: 'Attendance',
              accentColor: kColorEmerald,
              icon: Icons.calendar_today_rounded,
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Row(children: [
                  // Circular gauge
                  _AttendanceGauge(rate: attRate, color: attColor),
                  const SizedBox(width: 16),
                  Expanded(child: Column(children: [
                    _AttRow(label: 'Present', count: attPresent, color: kColorEmerald),
                    const SizedBox(height: 4),
                    _AttRow(label: 'Late', count: attLate, color: kColorAmber),
                    const SizedBox(height: 4),
                    _AttRow(label: 'Absent', count: attAbsent, color: kColorRose),
                    const SizedBox(height: 6),
                    const Divider(height: 1, color: Color(0x10000000)),
                    const SizedBox(height: 6),
                    _AttRow(label: 'Sessions', count: attTotal, color: kColorMuted),
                  ])),
                ]),
                if (_recent.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Text('Last ${_recent.length} sessions',
                    style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700,
                      color: kColorMuted, letterSpacing: 0.5)),
                  const SizedBox(height: 8),
                  Wrap(spacing: 6, runSpacing: 6,
                    children: _recent.reversed.map((r) {
                      final status = r['status']?.toString() ?? 'absent';
                      Color c;
                      IconData ic;
                      switch (status) {
                        case 'present': c = kColorEmerald; ic = Icons.check_rounded; break;
                        case 'late':    c = kColorAmber;   ic = Icons.access_time_rounded; break;
                        default:        c = kColorRose;    ic = Icons.remove_rounded;
                      }
                      return Container(
                        width: 30, height: 30,
                        decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(8)),
                        alignment: Alignment.center,
                        child: Icon(ic, size: 14, color: Colors.white),
                      );
                    }).toList()),
                ],
              ]),
            ),
            const SizedBox(height: 12),
          ],

          // Match performance
          _Section(
            label: 'Match Performance',
            accentColor: kColorPrimary,
            icon: Icons.sports_tennis_rounded,
            child: Column(children: [
              Row(children: [
                _BigStat(label: 'Played', value: '$played'),
                const SizedBox(width: 8),
                _BigStat(label: 'Wins', value: '$won', color: kColorEmerald),
                const SizedBox(width: 8),
                _BigStat(label: 'Losses', value: '$lost', color: kColorRose),
                const SizedBox(width: 8),
                _BigStat(label: 'Win %', value: '$winRate%', color: winColor),
              ]),
              const SizedBox(height: 12),
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: played > 0 ? won / played : 0,
                  minHeight: 8,
                  backgroundColor: Colors.black.withOpacity(0.06),
                  valueColor: AlwaysStoppedAnimation(winColor),
                ),
              ),
            ]),
          ),
          const SizedBox(height: 12),

          // Tournaments
          if (_tournaments != null &&
              ((_tournaments!['played'] as num?)?.toInt() ?? 0) > 0) ...[
            _Section(
              label: 'Tournament Record',
              accentColor: kColorAmber,
              icon: Icons.emoji_events_rounded,
              child: Row(children: [
                _BigStat(label: 'Entered',
                  value: (_tournaments!['played'] as num?)?.toInt().toString() ?? '0'),
                const SizedBox(width: 8),
                _BigStat(label: 'Won',
                  value: (_tournaments!['won'] as num?)?.toInt().toString() ?? '0',
                  color: kColorAmber),
                const SizedBox(width: 8),
                _BigStat(label: 'Runner-up',
                  value: (_tournaments!['runner_up'] as num?)?.toInt().toString() ?? '0',
                  color: kColorMuted),
              ]),
            ),
            const SizedBox(height: 12),
          ],

          // Share button
          ElevatedButton.icon(
            onPressed: _share,
            icon: const Icon(Icons.share_outlined, size: 18),
            label: const Text('Share Report'),
            style: ElevatedButton.styleFrom(
              backgroundColor: kColorEmerald,
              minimumSize: const Size.fromHeight(48),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

class _Section extends StatelessWidget {
  final String label;
  final Color accentColor;
  final IconData icon;
  final Widget child;
  const _Section({required this.label, required this.accentColor, required this.icon, required this.child});

  @override
  Widget build(BuildContext context) => Container(
    decoration: BoxDecoration(
      color: kColorSurface,
      borderRadius: BorderRadius.circular(14),
      boxShadow: const [BoxShadow(color: Color(0x0A000000), blurRadius: 8, offset: Offset(0, 2))],
    ),
    clipBehavior: Clip.hardEdge,
    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Container(height: 2, color: accentColor.withOpacity(0.5)),
      Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Icon(icon, color: accentColor, size: 14),
            const SizedBox(width: 6),
            Text(label.toUpperCase(), style: TextStyle(
              color: accentColor, fontWeight: FontWeight.w800, fontSize: 11, letterSpacing: 0.8)),
          ]),
          const SizedBox(height: 12),
          child,
        ]),
      ),
    ]),
  );
}

class _SummaryItem extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  const _SummaryItem({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) => Expanded(child: Column(children: [
    Text(value, style: TextStyle(color: color, fontWeight: FontWeight.w900, fontSize: 22)),
    Text(label, style: const TextStyle(color: kColorMuted, fontSize: 11, fontWeight: FontWeight.w600)),
  ]));
}

class _SummaryDivider extends StatelessWidget {
  @override
  Widget build(BuildContext context) =>
    Container(height: 36, width: 1, color: const Color(0x18000000));
}

class _AttendanceGauge extends StatelessWidget {
  final int rate;
  final Color color;
  const _AttendanceGauge({required this.rate, required this.color});

  @override
  Widget build(BuildContext context) => SizedBox(
    width: 80, height: 80,
    child: Stack(alignment: Alignment.center, children: [
      CircularProgressIndicator(
        value: rate / 100,
        strokeWidth: 8,
        backgroundColor: Colors.black.withOpacity(0.06),
        valueColor: AlwaysStoppedAnimation(color),
        strokeCap: StrokeCap.round,
      ),
      Column(mainAxisSize: MainAxisSize.min, children: [
        Text('$rate%', style: TextStyle(
          color: color, fontWeight: FontWeight.w900, fontSize: 16)),
        Text('att.', style: const TextStyle(color: kColorMuted, fontSize: 9)),
      ]),
    ]),
  );
}

class _AttRow extends StatelessWidget {
  final String label;
  final int count;
  final Color color;
  const _AttRow({required this.label, required this.count, required this.color});

  @override
  Widget build(BuildContext context) => Row(children: [
    Container(width: 8, height: 8, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
    const SizedBox(width: 6),
    Expanded(child: Text(label, style: const TextStyle(fontSize: 12, color: kColorMuted))),
    Text('$count', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: kColorText)),
  ]);
}

class _BigStat extends StatelessWidget {
  final String label;
  final String value;
  final Color? color;
  const _BigStat({required this.label, required this.value, this.color});

  @override
  Widget build(BuildContext context) => Expanded(child: Container(
    padding: const EdgeInsets.symmetric(vertical: 10),
    decoration: BoxDecoration(
      color: (color ?? kColorPrimary).withOpacity(0.06),
      borderRadius: BorderRadius.circular(10),
    ),
    child: Column(children: [
      Text(value, style: TextStyle(
        color: color ?? kColorText, fontWeight: FontWeight.w900, fontSize: 18)),
      Text(label, style: const TextStyle(fontSize: 10, color: kColorMuted, fontWeight: FontWeight.w600)),
    ]),
  ));
}
