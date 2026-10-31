import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/theme.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_service.dart';
import '../../widgets/loading_screen.dart';
import 'student_screen.dart';

class BatchScreen extends StatefulWidget {
  final String batchId;
  final String batchName;
  const BatchScreen({super.key, required this.batchId, required this.batchName});

  @override
  State<BatchScreen> createState() => _BatchScreenState();
}

class _BatchScreenState extends State<BatchScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;

  List<Map<String, dynamic>> _members = [];
  bool _loading = true;
  String? _currentUserId;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 4, vsync: this);
    _currentUserId = context.read<AuthProvider>().uid;
    _loadMembers();
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  Future<void> _loadMembers() async {
    try {
      final data = await ApiService.instance.get(
        '/api/organisations/batch_members',
        query: {'batchId': widget.batchId},
      );
      setState(() {
        _members = List<Map<String, dynamic>>.from(data['data'] ?? []);
        _loading = false;
      });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  bool get _isCoach {
    if (_currentUserId == null) return false;
    final me = _members.firstWhere(
      (m) => m['user_id']?.toString() == _currentUserId,
      orElse: () => {},
    );
    final role = me['role']?.toString().toLowerCase() ?? '';
    return role == 'admin' || role == 'coach';
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(widget.batchName),
      bottom: TabBar(
        controller: _tabs,
        tabs: const [
          Tab(text: 'Overview'),
          Tab(text: 'Attendance'),
          Tab(text: 'Schedule'),
          Tab(text: 'Announcements'),
        ],
      ),
    ),
    body: _loading
        ? const CenteredLoader()
        : TabBarView(
            controller: _tabs,
            children: [
              _OverviewTab(members: _members, batchId: widget.batchId),
              _AttendanceTab(
                batchId: widget.batchId,
                members: _members,
                isCoach: _isCoach,
              ),
              _ScheduleTab(
                batchId: widget.batchId,
                isCoach: _isCoach,
              ),
              _AnnouncementsTab(
                batchId: widget.batchId,
                isCoach: _isCoach,
                currentUserName: context.read<AuthProvider>().displayName ?? '',
              ),
            ],
          ),
  );
}

// ── Overview Tab ─────────────────────────────────────────────────────────────

class _OverviewTab extends StatelessWidget {
  final List<Map<String, dynamic>> members;
  final String batchId;
  const _OverviewTab({required this.members, required this.batchId});

  @override
  Widget build(BuildContext context) {
    final students = members.where((m) =>
      (m['role']?.toString().toLowerCase() ?? 'member') == 'member').toList();
    final coaches = members.where((m) {
      final r = m['role']?.toString().toLowerCase() ?? '';
      return r == 'admin' || r == 'coach';
    }).toList();

    if (members.isEmpty) {
      return const EmptyView(message: 'No members yet', icon: Icons.groups_outlined);
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (coaches.isNotEmpty) ...[
          _sectionLabel('Coaches', kColorAmber, Icons.star_rounded),
          const SizedBox(height: 8),
          ...coaches.map((m) => _MemberRow(member: m)),
          const SizedBox(height: 16),
        ],
        if (students.isNotEmpty) ...[
          _sectionLabel('Students (${students.length})', kColorPrimary, Icons.school_rounded),
          const SizedBox(height: 8),
          ...students.asMap().entries.map((e) =>
            Builder(builder: (ctx) => GestureDetector(
              onTap: () => Navigator.push(ctx, MaterialPageRoute(
                builder: (_) => StudentScreen(
                  userId: e.value['user_id']?.toString() ?? '',
                  batchId: batchId,
                  studentName: e.value['name']?.toString() ?? 'Student',
                ))),
              child: _MemberRow(member: e.value, rank: e.key + 1),
            ))),
        ],
      ],
    );
  }

  Widget _sectionLabel(String label, Color color, IconData icon) =>
    Row(children: [
      Icon(icon, color: color, size: 14),
      const SizedBox(width: 6),
      Text(label, style: TextStyle(
        color: color, fontWeight: FontWeight.w800, fontSize: 12, letterSpacing: 0.5)),
    ]);
}

class _MemberRow extends StatelessWidget {
  final Map<String, dynamic> member;
  final int? rank;
  const _MemberRow({required this.member, this.rank});

  @override
  Widget build(BuildContext context) {
    final name   = member['name']?.toString() ?? '';
    final points = (member['clan_points'] as num?)?.toDouble() ?? 0;
    final played = (member['matchesplayed'] as num?)?.toInt() ?? 0;
    final won    = (member['matcheswon'] as num?)?.toInt() ?? 0;

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: const BoxDecoration(
        color: kColorSurface,
        borderRadius: BorderRadius.all(Radius.circular(12)),
        boxShadow: [
          BoxShadow(color: Color(0x0A000000), blurRadius: 6, offset: Offset(0, 2)),
        ],
      ),
      child: Row(children: [
        if (rank != null) _RankBadge(rank: rank!),
        if (rank != null) const SizedBox(width: 10),
        CircleAvatar(
          radius: 18,
          backgroundColor: kColorPrimary.withOpacity(0.12),
          child: Text(name.isEmpty ? '?' : name[0],
            style: const TextStyle(color: kColorPrimary, fontWeight: FontWeight.w700, fontSize: 14)),
        ),
        const SizedBox(width: 10),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: kColorText)),
          Text('${points.toStringAsFixed(1)} pts · $won/$played wins',
            style: const TextStyle(fontSize: 11, color: kColorMuted)),
        ])),
        const Icon(Icons.chevron_right_rounded, color: kColorMuted, size: 18),
      ]),
    );
  }
}

class _RankBadge extends StatelessWidget {
  final int rank;
  const _RankBadge({required this.rank});

  @override
  Widget build(BuildContext context) {
    Color bg;
    if (rank == 1) bg = kColorAmber;
    else if (rank == 2) bg = const Color(0xFF94A3B8);
    else if (rank == 3) bg = const Color(0xFF92400E);
    else return Container(
      width: 28, height: 28,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: const Color(0x08000000), borderRadius: BorderRadius.circular(6)),
      child: Text('$rank', style: const TextStyle(fontSize: 11, color: kColorMuted, fontWeight: FontWeight.w700)),
    );
    return Container(
      width: 28, height: 28,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(6)),
      child: Icon(rank <= 2 ? Icons.emoji_events_rounded : Icons.military_tech_rounded,
        size: 14, color: Colors.white),
    );
  }
}

// ── Attendance Tab ────────────────────────────────────────────────────────────

class _AttendanceTab extends StatefulWidget {
  final String batchId;
  final List<Map<String, dynamic>> members;
  final bool isCoach;
  const _AttendanceTab({required this.batchId, required this.members, required this.isCoach});

  @override
  State<_AttendanceTab> createState() => _AttendanceTabState();
}

class _AttendanceTabState extends State<_AttendanceTab>
    with AutomaticKeepAliveClientMixin {
  @override bool get wantKeepAlive => true;

  DateTime _date = DateTime.now();
  Map<String, String> _statusMap = {};
  bool _loading = true;
  bool _saving = false;
  List<Map<String, dynamic>> _summary = [];
  int _totalSessions = 0;
  List<Map<String, dynamic>> _ownMembers = [];

  List<Map<String, dynamic>> get _students =>
      _ownMembers.isNotEmpty ? _ownMembers : widget.members;

  @override
  void initState() {
    super.initState();
    _initLoad();
  }

  Future<void> _initLoad() async {
    try {
      final data = await ApiService.instance.get(
        '/api/organisations/batch_members',
        query: {'batchId': widget.batchId},
      );
      if (mounted) {
        setState(() => _ownMembers =
            List<Map<String, dynamic>>.from(data['data'] ?? []));
      }
    } catch (_) {}
    _loadAttendance();
    _loadSummary();
  }

  String _dateStr(DateTime d) =>
    '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  Future<void> _loadAttendance() async {
    setState(() => _loading = true);
    try {
      final data = await ApiService.instance.get(
        '/api/organisations/attendance',
        query: {'batchId': widget.batchId, 'date': _dateStr(_date)},
      );
      final saved = <String, String>{};
      for (final row in List<Map<String, dynamic>>.from(data['data'] ?? [])) {
        saved[row['user_id']?.toString() ?? ''] = row['status']?.toString() ?? 'absent';
      }
      setState(() {
        _statusMap = {
          for (final s in _students)
            (s['user_id']?.toString() ?? ''): saved[s['user_id']?.toString() ?? ''] ?? 'present',
        };
        _loading = false;
      });
    } catch (_) {
      setState(() {
        _statusMap = { for (final s in _students) (s['user_id']?.toString() ?? ''): 'present' };
        _loading = false;
      });
    }
  }

  Future<void> _loadSummary() async {
    try {
      final data = await ApiService.instance.get(
        '/api/organisations/attendance/summary',
        query: {'batchId': widget.batchId},
      );
      setState(() {
        _summary = List<Map<String, dynamic>>.from(data['data'] ?? []);
        _totalSessions = (data['totalSessions'] as num?)?.toInt() ?? 0;
      });
    } catch (_) {}
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      final records = _statusMap.entries.map((e) => {'userId': e.key, 'status': e.value}).toList();
      await ApiService.instance.post('/api/organisations/attendance', {
        'batchId': widget.batchId,
        'date': _dateStr(_date),
        'records': records,
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Attendance saved!')));
      _loadSummary();
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Date picker
        GestureDetector(
          onTap: () async {
            final d = await showDatePicker(
              context: context,
              initialDate: _date,
              firstDate: DateTime(2020),
              lastDate: DateTime.now(),
            );
            if (d != null) {
              setState(() => _date = d);
              _loadAttendance();
            }
          },
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: const BoxDecoration(
              color: kColorSurface,
              borderRadius: BorderRadius.all(Radius.circular(14)),
              boxShadow: [BoxShadow(color: Color(0x0A000000), blurRadius: 6, offset: Offset(0, 2))],
            ),
            child: Row(children: [
              const Icon(Icons.calendar_today_outlined, color: kColorPrimary, size: 18),
              const SizedBox(width: 10),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Date', style: TextStyle(color: kColorMuted, fontSize: 11, fontWeight: FontWeight.w600)),
                Text(_dateStr(_date), style: const TextStyle(
                  color: kColorText, fontWeight: FontWeight.w700, fontSize: 15)),
              ])),
              const Icon(Icons.chevron_right_rounded, color: kColorMuted),
            ]),
          ),
        ),
        const SizedBox(height: 16),

        if (_loading) ...[
          const SizedBox(
            height: 300,
            child: Center(child: CircularProgressIndicator(color: kColorPrimary)),
          ),
        ] else if (_students.isEmpty) ...[
          const EmptyView(message: 'No students in this batch', icon: Icons.person_outline),
        ] else ...[
          // Per-student attendance
          ..._students.map((s) {
            final uid    = s['user_id']?.toString() ?? '';
            final name   = s['name']?.toString() ?? '';
            final status = _statusMap[uid] ?? 'present';

            return Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: const BoxDecoration(
                color: kColorSurface,
                borderRadius: BorderRadius.all(Radius.circular(12)),
                boxShadow: [BoxShadow(color: Color(0x0A000000), blurRadius: 6, offset: Offset(0, 2))],
              ),
              child: Row(children: [
                CircleAvatar(
                  radius: 16,
                  backgroundColor: kColorPrimary.withOpacity(0.1),
                  child: Text(name.isEmpty ? '?' : name[0],
                    style: const TextStyle(color: kColorPrimary, fontWeight: FontWeight.w700, fontSize: 12)),
                ),
                const SizedBox(width: 10),
                Expanded(child: Text(name, style: const TextStyle(
                  fontSize: 13, fontWeight: FontWeight.w600, color: kColorText))),
                if (widget.isCoach) ..._buildStatusBtns(uid, status)
                else _statusChip(status),
              ]),
            );
          }),

          if (widget.isCoach) ...[
            const SizedBox(height: 12),
            ElevatedButton(
              onPressed: _saving ? null : _save,
              child: _saving
                  ? const SizedBox(width: 20, height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('Save Attendance'),
            ),
          ],
        ],

        // Summary
        if (_summary.isNotEmpty) ...[
          const SizedBox(height: 24),
          Text('Attendance Summary ($_totalSessions sessions)',
            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14, color: kColorText)),
          const SizedBox(height: 10),
          ..._summary.map((row) {
            final name    = row['name']?.toString() ?? '';
            final present = (row['present_count'] as num?)?.toInt() ?? 0;
            final late    = (row['late_count'] as num?)?.toInt() ?? 0;
            final absent  = (row['absent_count'] as num?)?.toInt() ?? 0;
            final rate    = _totalSessions > 0
                ? ((present + late) / _totalSessions * 100).round() : 0;

            Color barColor;
            if (rate >= 75) barColor = kColorEmerald;
            else if (rate >= 50) barColor = kColorAmber;
            else barColor = kColorRose;

            return Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(12),
              decoration: const BoxDecoration(
                color: kColorSurface,
                borderRadius: BorderRadius.all(Radius.circular(12)),
                boxShadow: [BoxShadow(color: Color(0x0A000000), blurRadius: 6, offset: Offset(0, 2))],
              ),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Expanded(child: Text(name, style: const TextStyle(
                    fontSize: 13, fontWeight: FontWeight.w600, color: kColorText))),
                  Text('$rate%', style: TextStyle(
                    color: barColor, fontWeight: FontWeight.w700, fontSize: 12)),
                ]),
                const SizedBox(height: 6),
                ClipRRect(
                  borderRadius: BorderRadius.circular(3),
                  child: LinearProgressIndicator(
                    value: _totalSessions > 0 ? (present + late) / _totalSessions : 0,
                    minHeight: 4,
                    backgroundColor: Colors.black.withOpacity(0.08),
                    valueColor: AlwaysStoppedAnimation(barColor),
                  ),
                ),
                const SizedBox(height: 4),
                Text('P: $present · L: $late · A: $absent',
                  style: const TextStyle(fontSize: 11, color: kColorMuted)),
              ]),
            );
          }),
        ],
      ],
    );
  }

  List<Widget> _buildStatusBtns(String uid, String status) {
    const statuses = [
      ('present', kColorEmerald, Icons.check_rounded),
      ('late', kColorAmber, Icons.access_time_rounded),
      ('absent', kColorRose, Icons.remove_rounded),
    ];
    return statuses.map((s) {
      final sel = status == s.$1;
      return GestureDetector(
        onTap: () => setState(() => _statusMap[uid] = s.$1),
        child: Container(
          margin: const EdgeInsets.only(left: 4),
          width: 32, height: 28,
          decoration: BoxDecoration(
            color: sel ? s.$2 : kColorBg,
            borderRadius: BorderRadius.circular(6),
            border: Border.all(color: sel ? s.$2 : const Color(0x18000000)),
          ),
          child: Icon(s.$3, size: 14, color: sel ? Colors.white : kColorMuted),
        ),
      );
    }).toList();
  }

  Widget _statusChip(String status) {
    Color color;
    String label;
    switch (status) {
      case 'present': color = kColorEmerald; label = 'Present'; break;
      case 'late':    color = kColorAmber;   label = 'Late';    break;
      default:        color = kColorRose;    label = 'Absent';
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(6)),
      child: Text(label, style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w700)),
    );
  }
}

// ── Schedule Tab ──────────────────────────────────────────────────────────────

class _ScheduleTab extends StatefulWidget {
  final String batchId;
  final bool isCoach;
  const _ScheduleTab({required this.batchId, required this.isCoach});

  @override
  State<_ScheduleTab> createState() => _ScheduleTabState();
}

class _ScheduleTabState extends State<_ScheduleTab>
    with AutomaticKeepAliveClientMixin {
  @override bool get wantKeepAlive => true;

  List<Map<String, dynamic>> _sessions = [];
  bool _loading = true;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final data = await ApiService.instance.get(
        '/api/organisations/sessions',
        query: {'batchId': widget.batchId},
      );
      setState(() {
        _sessions = List<Map<String, dynamic>>.from(data['data'] ?? []);
        _loading = false;
      });
    } catch (_) { setState(() => _loading = false); }
  }

  Future<void> _delete(int id) async {
    try {
      await ApiService.instance.delete('/api/organisations/sessions?sessionId=$id');
      _load();
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  void _showAdd() {
    final titleCtrl  = TextEditingController();
    DateTime dt = DateTime.now().add(const Duration(days: 1));
    int duration = 60;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: kColorSurface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setS) => Padding(
          padding: EdgeInsets.fromLTRB(24, 24, 24, MediaQuery.of(ctx).viewInsets.bottom + 24),
          child: Column(mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const Text('Add Session', style: TextStyle(
              fontSize: 18, fontWeight: FontWeight.w800, color: kColorText)),
            const SizedBox(height: 16),
            TextField(controller: titleCtrl,
              decoration: const InputDecoration(labelText: 'Title')),
            const SizedBox(height: 12),
            GestureDetector(
              onTap: () async {
                final d = await showDatePicker(
                  context: ctx, initialDate: dt,
                  firstDate: DateTime.now(),
                  lastDate: DateTime.now().add(const Duration(days: 365)));
                if (d != null) setS(() => dt = DateTime(d.year, d.month, d.day, dt.hour, dt.minute));
              },
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: const BoxDecoration(
                  color: kColorBg,
                  borderRadius: BorderRadius.all(Radius.circular(12)),
                  boxShadow: [BoxShadow(color: Color(0x08000000), blurRadius: 4)]),
                child: Text('Date: ${dt.year}-${dt.month.toString().padLeft(2,'0')}-${dt.day.toString().padLeft(2,'0')}',
                  style: const TextStyle(color: kColorText)),
              ),
            ),
            const SizedBox(height: 12),
            Row(children: [
              const Expanded(child: Text('Duration (min)', style: TextStyle(color: kColorMuted, fontSize: 13))),
              ...([30, 60, 90, 120]).map((d) => GestureDetector(
                onTap: () => setS(() => duration = d),
                child: Container(
                  margin: const EdgeInsets.only(left: 6),
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: duration == d ? kColorPrimary : kColorBg,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: duration == d ? kColorPrimary : const Color(0x18000000))),
                  child: Text('$d', style: TextStyle(
                    color: duration == d ? Colors.white : kColorText,
                    fontSize: 12, fontWeight: FontWeight.w600)),
                ),
              )),
            ]),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: () async {
                if (titleCtrl.text.trim().isEmpty) return;
                try {
                  final scheduled = '${dt.year}-${dt.month.toString().padLeft(2,'0')}-${dt.day.toString().padLeft(2,'0')} ${dt.hour.toString().padLeft(2,'0')}:${dt.minute.toString().padLeft(2,'0')}:00';
                  await ApiService.instance.post('/api/organisations/sessions', {
                    'batchId': widget.batchId,
                    'title': titleCtrl.text.trim(),
                    'scheduledAt': scheduled,
                    'durationMinutes': duration,
                    'notes': null,
                  });
                  if (ctx.mounted) Navigator.pop(ctx);
                  _load();
                } catch (e) {
                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
                }
              },
              child: const Text('Add Session'),
            ),
          ]),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    if (_loading) return const CenteredLoader();

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (widget.isCoach)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: ElevatedButton.icon(
              onPressed: _showAdd,
              icon: const Icon(Icons.add, size: 18),
              label: const Text('Add Session'),
            ),
          ),
        if (_sessions.isEmpty)
          const EmptyView(message: 'No sessions scheduled', icon: Icons.calendar_today_outlined),
        ..._sessions.map((s) {
          final id    = (s['session_id'] as num?)?.toInt() ?? 0;
          final title = s['title']?.toString() ?? 'Session';
          final when  = s['scheduled_at']?.toString() ?? '';
          final mins  = (s['duration_minutes'] as num?)?.toInt() ?? 0;

          return Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.all(14),
            decoration: const BoxDecoration(
              color: kColorSurface,
              borderRadius: BorderRadius.all(Radius.circular(14)),
              boxShadow: [BoxShadow(color: Color(0x0A000000), blurRadius: 6, offset: Offset(0, 2))],
            ),
            child: Row(children: [
              Container(
                width: 40, height: 40,
                decoration: BoxDecoration(
                  color: kColorPrimary.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(10)),
                child: const Icon(Icons.sports_rounded, color: kColorPrimary, size: 20),
              ),
              const SizedBox(width: 12),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(title, style: const TextStyle(
                  fontWeight: FontWeight.w700, fontSize: 14, color: kColorText)),
                Text('$when · ${mins}min',
                  style: const TextStyle(fontSize: 12, color: kColorMuted)),
              ])),
              if (widget.isCoach)
                IconButton(
                  icon: const Icon(Icons.delete_outline, color: kColorMuted, size: 20),
                  onPressed: () => _delete(id),
                ),
            ]),
          );
        }),
      ],
    );
  }
}

// ── Announcements Tab ─────────────────────────────────────────────────────────

class _AnnouncementsTab extends StatefulWidget {
  final String batchId;
  final bool isCoach;
  final String currentUserName;
  const _AnnouncementsTab({required this.batchId, required this.isCoach, required this.currentUserName});

  @override
  State<_AnnouncementsTab> createState() => _AnnouncementsTabState();
}

class _AnnouncementsTabState extends State<_AnnouncementsTab>
    with AutomaticKeepAliveClientMixin {
  @override bool get wantKeepAlive => true;

  List<Map<String, dynamic>> _announcements = [];
  bool _loading = true;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final data = await ApiService.instance.get(
        '/api/organisations/announcements',
        query: {'batchId': widget.batchId},
      );
      setState(() {
        _announcements = List<Map<String, dynamic>>.from(data['data'] ?? []);
        _loading = false;
      });
    } catch (_) { setState(() => _loading = false); }
  }

  Future<void> _togglePin(Map<String, dynamic> ann) async {
    try {
      await ApiService.instance.patch('/api/organisations/announcements', {
        'announcementId': ann['announcement_id'],
        'pinned': ann['pinned'] == 1 ? 0 : 1,
      });
      _load();
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  Future<void> _delete(int id) async {
    try {
      await ApiService.instance.delete('/api/organisations/announcements?announcementId=$id');
      _load();
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  void _showAdd() {
    final titleCtrl = TextEditingController();
    final bodyCtrl  = TextEditingController();
    bool pinned = false;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: kColorSurface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setS) => Padding(
          padding: EdgeInsets.fromLTRB(24, 24, 24, MediaQuery.of(ctx).viewInsets.bottom + 24),
          child: Column(mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const Text('New Announcement', style: TextStyle(
              fontSize: 18, fontWeight: FontWeight.w800, color: kColorText)),
            const SizedBox(height: 16),
            TextField(controller: titleCtrl,
              decoration: const InputDecoration(labelText: 'Title')),
            const SizedBox(height: 12),
            TextField(controller: bodyCtrl,
              maxLines: 3,
              decoration: const InputDecoration(labelText: 'Message')),
            const SizedBox(height: 8),
            Row(children: [
              Checkbox(value: pinned, onChanged: (v) => setS(() => pinned = v ?? false),
                activeColor: kColorAmber),
              const Text('Pin this announcement', style: TextStyle(color: kColorText, fontSize: 13)),
            ]),
            const SizedBox(height: 8),
            ElevatedButton(
              onPressed: () async {
                if (titleCtrl.text.trim().isEmpty) return;
                try {
                  await ApiService.instance.post('/api/organisations/announcements', {
                    'batchId': widget.batchId,
                    'authorName': widget.currentUserName,
                    'title': titleCtrl.text.trim(),
                    'body': bodyCtrl.text.trim(),
                    'pinned': pinned,
                  });
                  if (ctx.mounted) Navigator.pop(ctx);
                  _load();
                } catch (e) {
                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
                }
              },
              child: const Text('Post'),
            ),
          ]),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    if (_loading) return const CenteredLoader();

    final pinned  = _announcements.where((a) => a['pinned'] == 1).toList();
    final regular = _announcements.where((a) => a['pinned'] != 1).toList();

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (widget.isCoach)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: ElevatedButton.icon(
              onPressed: _showAdd,
              icon: const Icon(Icons.add, size: 18),
              label: const Text('New Announcement'),
            ),
          ),
        if (_announcements.isEmpty)
          const EmptyView(message: 'No announcements yet', icon: Icons.campaign_outlined),
        ...[...pinned, ...regular].map((a) {
          final id      = (a['announcement_id'] as num?)?.toInt() ?? 0;
          final title   = a['title']?.toString() ?? '';
          final body    = a['body']?.toString() ?? '';
          final author  = a['author_name']?.toString() ?? '';
          final isPinned = a['pinned'] == 1;

          return Container(
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: kColorSurface,
              borderRadius: BorderRadius.circular(14),
              boxShadow: [
                BoxShadow(
                  color: isPinned ? kColorAmber.withOpacity(0.15) : const Color(0x0A000000),
                  blurRadius: 8, offset: const Offset(0, 2)),
              ],
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                if (isPinned) ...[
                  const Icon(Icons.push_pin_rounded, color: kColorAmber, size: 14),
                  const SizedBox(width: 4),
                ],
                Expanded(child: Text(title, style: const TextStyle(
                  fontWeight: FontWeight.w700, fontSize: 14, color: kColorText))),
                if (widget.isCoach) ...[
                  GestureDetector(
                    onTap: () => _togglePin(a),
                    child: Icon(
                      isPinned ? Icons.push_pin_rounded : Icons.push_pin_outlined,
                      color: isPinned ? kColorAmber : kColorMuted, size: 18)),
                  const SizedBox(width: 4),
                  GestureDetector(
                    onTap: () => _delete(id),
                    child: const Icon(Icons.delete_outline, color: kColorMuted, size: 18)),
                ],
              ]),
              if (body.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(body, style: const TextStyle(fontSize: 13, color: kColorMuted)),
              ],
              if (author.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text('— $author', style: const TextStyle(fontSize: 11, color: kColorMuted)),
              ],
            ]),
          );
        }),
      ],
    );
  }
}
