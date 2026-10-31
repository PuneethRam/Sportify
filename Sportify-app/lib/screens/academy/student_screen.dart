import 'package:flutter/material.dart';
import '../../core/theme.dart';
import '../../services/api_service.dart';
import '../../widgets/loading_screen.dart';
import 'report_screen.dart';

class StudentScreen extends StatefulWidget {
  final String userId;
  final String batchId;
  final String studentName;
  const StudentScreen({
    super.key,
    required this.userId,
    required this.batchId,
    required this.studentName,
  });

  @override
  State<StudentScreen> createState() => _StudentScreenState();
}

class _StudentScreenState extends State<StudentScreen> {
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

  @override
  Widget build(BuildContext context) {
    if (_loading) return Scaffold(appBar: AppBar(title: Text(widget.studentName)), body: const CenteredLoader());
    if (_error != null || _stats == null) {
      return Scaffold(
        appBar: AppBar(title: Text(widget.studentName)),
        body: ErrorView(message: _error ?? 'Not found', onRetry: _load),
      );
    }

    final stats = _stats!;
    final name    = stats['name']?.toString() ?? widget.studentName;
    final points  = (stats['clan_points'] as num?)?.toDouble() ?? 0;
    final played  = (stats['matchesplayed'] as num?)?.toInt() ?? 0;
    final won     = (stats['matcheswon'] as num?)?.toInt() ?? 0;
    final lost    = (stats['matcheslost'] as num?)?.toInt() ?? 0;
    final winRate = played > 0 ? (won / played * 100).round() : 0;

    final attTotal    = (_attendance?['totalSessions'] as num?)?.toInt() ?? 0;
    final attPresent  = (_attendance?['present'] as num?)?.toInt() ?? 0;
    final attLate     = (_attendance?['late'] as num?)?.toInt() ?? 0;
    final attAbsent   = (_attendance?['absent'] as num?)?.toInt() ?? 0;
    final attRate     = attTotal > 0 ? ((attPresent + attLate) / attTotal * 100).round() : 0;

    Color winColor;
    if (winRate >= 70) winColor = kColorEmerald;
    else if (winRate >= 50) winColor = kColorPrimary;
    else winColor = kColorRose;

    Color attColor;
    if (attRate >= 75) attColor = kColorEmerald;
    else if (attRate >= 50) attColor = kColorAmber;
    else attColor = kColorRose;

    final initials = name.trim().split(' ')
        .where((p) => p.isNotEmpty)
        .map((p) => p[0])
        .take(2)
        .join()
        .toUpperCase();

    return Scaffold(
      appBar: AppBar(
        title: Text(name),
        actions: [
          IconButton(
            icon: const Icon(Icons.summarize_outlined),
            tooltip: 'View Report',
            onPressed: () => Navigator.push(context, MaterialPageRoute(
              builder: (_) => ReportScreen(
                userId: widget.userId,
                batchId: widget.batchId,
                studentName: name,
              ),
            )),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        color: kColorPrimary,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [

            // Player card
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: kColorSurface,
                borderRadius: BorderRadius.circular(18),
                boxShadow: const [BoxShadow(color: Color(0x0A000000), blurRadius: 8, offset: Offset(0, 2))],
              ),
              child: Row(children: [
                Container(
                  width: 64, height: 64,
                  decoration: BoxDecoration(
                    color: kColorPrimary.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  alignment: Alignment.center,
                  child: Text(initials, style: const TextStyle(
                    color: kColorPrimary, fontWeight: FontWeight.w900, fontSize: 24)),
                ),
                const SizedBox(width: 14),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(name, style: const TextStyle(
                    fontWeight: FontWeight.w800, fontSize: 18, color: kColorText)),
                  const SizedBox(height: 4),
                  Row(children: [
                    const Icon(Icons.emoji_events_rounded, color: kColorAmber, size: 14),
                    const SizedBox(width: 4),
                    Text('${points.toStringAsFixed(1)} pts',
                      style: const TextStyle(fontSize: 13, color: kColorText, fontWeight: FontWeight.w600)),
                  ]),
                ])),
              ]),
            ),
            const SizedBox(height: 16),

            // Match stats grid
            _sectionLabel('Match Stats'),
            const SizedBox(height: 8),
            Row(children: [
              Expanded(child: _StatCard(label: 'Played', value: '$played',
                icon: Icons.sports_tennis_rounded, color: kColorPrimary)),
              const SizedBox(width: 8),
              Expanded(child: _StatCard(label: 'Won', value: '$won',
                icon: Icons.emoji_events_rounded, color: kColorEmerald)),
              const SizedBox(width: 8),
              Expanded(child: _StatCard(label: 'Lost', value: '$lost',
                icon: Icons.close_rounded, color: kColorRose)),
              const SizedBox(width: 8),
              Expanded(child: _StatCard(label: 'Points', value: points.toStringAsFixed(1),
                icon: Icons.star_rounded, color: kColorAmber)),
            ]),
            const SizedBox(height: 16),

            // Win rate
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: kColorSurface,
                borderRadius: BorderRadius.circular(14),
                boxShadow: const [BoxShadow(color: Color(0x0A000000), blurRadius: 8, offset: Offset(0, 2))],
              ),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  const Icon(Icons.trending_up_rounded, color: kColorPrimary, size: 16),
                  const SizedBox(width: 6),
                  const Text('Win Rate', style: TextStyle(
                    fontWeight: FontWeight.w700, fontSize: 13, color: kColorText)),
                  const Spacer(),
                  Text('$winRate%', style: TextStyle(
                    color: winColor, fontWeight: FontWeight.w900, fontSize: 18)),
                ]),
                const SizedBox(height: 10),
                ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: played > 0 ? won / played : 0,
                    minHeight: 8,
                    backgroundColor: Colors.black.withOpacity(0.06),
                    valueColor: AlwaysStoppedAnimation(winColor),
                  ),
                ),
                const SizedBox(height: 8),
                Row(children: [
                  Text('${won}W · ${lost}L', style: const TextStyle(color: kColorMuted, fontSize: 12)),
                  const Spacer(),
                  Text(winRate >= 70 ? 'Excellent' : winRate >= 50 ? 'Good' : 'Needs work',
                    style: TextStyle(color: winColor, fontSize: 12, fontWeight: FontWeight.w600)),
                ]),
              ]),
            ),

            // Tournament stats
            if (_tournaments != null && ((_tournaments!['played'] as num?)?.toInt() ?? 0) > 0) ...[
              const SizedBox(height: 16),
              _sectionLabel('Tournaments'),
              const SizedBox(height: 8),
              Row(children: [
                Expanded(child: _StatCard(label: 'Entered',
                  value: (_tournaments!['played'] as num?)?.toInt().toString() ?? '0',
                  icon: Icons.sports_kabaddi_rounded, color: kColorPrimary)),
                const SizedBox(width: 8),
                Expanded(child: _StatCard(label: 'Won',
                  value: (_tournaments!['won'] as num?)?.toInt().toString() ?? '0',
                  icon: Icons.emoji_events_rounded, color: kColorAmber)),
                const SizedBox(width: 8),
                Expanded(child: _StatCard(label: 'Runner-up',
                  value: (_tournaments!['runner_up'] as num?)?.toInt().toString() ?? '0',
                  icon: Icons.military_tech_rounded, color: kColorMuted)),
              ]),
            ],

            // Attendance
            if (attTotal > 0) ...[
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: kColorSurface,
                  borderRadius: BorderRadius.circular(14),
                  boxShadow: const [BoxShadow(color: Color(0x0A000000), blurRadius: 8, offset: Offset(0, 2))],
                ),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    const Icon(Icons.calendar_today_rounded, color: kColorEmerald, size: 16),
                    const SizedBox(width: 6),
                    const Text('Attendance', style: TextStyle(
                      fontWeight: FontWeight.w700, fontSize: 13, color: kColorText)),
                    const Spacer(),
                    Text('$attRate%', style: TextStyle(
                      color: attColor, fontWeight: FontWeight.w900, fontSize: 18)),
                  ]),
                  const SizedBox(height: 10),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(
                      value: attTotal > 0 ? (attPresent + attLate) / attTotal : 0,
                      minHeight: 8,
                      backgroundColor: Colors.black.withOpacity(0.06),
                      valueColor: AlwaysStoppedAnimation(attColor),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(children: [
                    Expanded(child: _attPill('Present', attPresent, kColorEmerald)),
                    const SizedBox(width: 8),
                    Expanded(child: _attPill('Late', attLate, kColorAmber)),
                    const SizedBox(width: 8),
                    Expanded(child: _attPill('Absent', attAbsent, kColorRose)),
                  ]),
                  const SizedBox(height: 8),
                  Text('$attTotal total sessions',
                    style: const TextStyle(fontSize: 11, color: kColorMuted), textAlign: TextAlign.center),

                  if (_recent.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    const Text('Last sessions', style: TextStyle(
                      fontSize: 11, fontWeight: FontWeight.w700, color: kColorMuted, letterSpacing: 0.5)),
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
            ],

            const SizedBox(height: 16),
            OutlinedButton.icon(
              onPressed: () => Navigator.push(context, MaterialPageRoute(
                builder: (_) => ReportScreen(
                  userId: widget.userId,
                  batchId: widget.batchId,
                  studentName: name,
                ),
              )),
              icon: const Icon(Icons.summarize_outlined, size: 18),
              label: const Text('View Full Report'),
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
            ),
          ],
        ),
      ),
    );
  }

  Widget _sectionLabel(String label) => Text(label, style: const TextStyle(
    fontWeight: FontWeight.w800, fontSize: 12, color: kColorMuted, letterSpacing: 0.8));

  Widget _attPill(String label, int count, Color color) => Container(
    padding: const EdgeInsets.symmetric(vertical: 8),
    decoration: BoxDecoration(
      color: color.withOpacity(0.1),
      borderRadius: BorderRadius.circular(10),
    ),
    child: Column(children: [
      Text('$count', style: TextStyle(color: color, fontWeight: FontWeight.w900, fontSize: 18)),
      Text(label, style: const TextStyle(fontSize: 10, color: kColorMuted, fontWeight: FontWeight.w600)),
    ]),
  );
}

class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;
  const _StatCard({required this.label, required this.value, required this.icon, required this.color});

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(vertical: 14),
    decoration: BoxDecoration(
      color: color.withOpacity(0.08),
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: color.withOpacity(0.18)),
    ),
    child: Column(children: [
      Icon(icon, color: color, size: 18),
      const SizedBox(height: 6),
      Text(value, style: TextStyle(
        color: color, fontWeight: FontWeight.w900, fontSize: 20)),
      const SizedBox(height: 2),
      Text(label, style: const TextStyle(
        fontSize: 10, color: kColorMuted, fontWeight: FontWeight.w600)),
    ]),
  );
}
