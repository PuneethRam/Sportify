import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme.dart';
import '../../models/organisation_model.dart';
import '../../services/api_service.dart';
import '../../widgets/loading_screen.dart';
import 'batch_screen.dart';

class OrgDetailScreen extends StatefulWidget {
  final String orgId;
  final String orgName;
  final bool isOwner;
  const OrgDetailScreen({
    super.key,
    required this.orgId,
    this.orgName = '',
    this.isOwner = false,
  });

  @override
  State<OrgDetailScreen> createState() => _OrgDetailScreenState();
}

class _OrgDetailScreenState extends State<OrgDetailScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;
  List<Batch> _batches = [];
  bool _loading = true;

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
    try {
      final data = await ApiService.instance.get(
        '/api/organisations/get_batches',
        query: {'orgId': widget.orgId},
      );
      setState(() {
        _batches = (data['data'] as List? ?? [])
            .map((e) => Batch.fromJson({...e, 'org_id': widget.orgId, 'org_name': widget.orgName}))
            .toList();
        _loading = false;
      });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(widget.orgName.isNotEmpty ? widget.orgName : 'Academy'),
      bottom: TabBar(
        controller: _tabs,
        tabs: const [
          Tab(text: 'Batches'),
          Tab(text: 'Sessions'),
          Tab(text: 'Announcements'),
        ],
      ),
    ),
    body: _loading
        ? const CenteredLoader()
        : TabBarView(
            controller: _tabs,
            children: [
              _BatchesTab(
                orgId: widget.orgId,
                batches: _batches,
                onRefresh: _load,
                isOwner: widget.isOwner,
              ),
              _SessionsTab(orgId: widget.orgId),
              _AnnouncementsTab(orgId: widget.orgId),
            ],
          ),
  );
}

// ── Batches Tab ──────────────────────────────────────────────────────────────

class _BatchesTab extends StatelessWidget {
  final String orgId;
  final List<Batch> batches;
  final VoidCallback onRefresh;
  final bool isOwner;

  const _BatchesTab({
    required this.orgId,
    required this.batches,
    required this.onRefresh,
    required this.isOwner,
  });

  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(16),
    children: [
      if (isOwner) ...[
        ElevatedButton.icon(
          onPressed: () => _showCreateBatch(context),
          icon: const Icon(Icons.add, size: 18),
          label: const Text('Create Batch'),
        ),
        const SizedBox(height: 16),
      ],
      if (batches.isEmpty)
        const EmptyView(message: 'No batches yet', icon: Icons.groups_outlined)
      else
        ...batches.map((b) => _BatchRow(batch: b, isOwner: isOwner)),
    ],
  );

  void _showCreateBatch(BuildContext context) {
    final ctrl = TextEditingController();
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: kColorSurface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(24, 24, 24,
          MediaQuery.of(ctx).viewInsets.bottom + 24),
        child: Column(mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('Create Batch', style: TextStyle(
              fontSize: 18, fontWeight: FontWeight.w800, color: kColorText)),
            const SizedBox(height: 16),
            TextField(
              controller: ctrl,
              decoration: const InputDecoration(labelText: 'Batch Name'),
              textCapitalization: TextCapitalization.words,
            ),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: () async {
                if (ctrl.text.trim().isEmpty) return;
                try {
                  await ApiService.instance.post(
                    '/api/organisations/create_batch', {
                    'orgId': orgId,
                    'name': ctrl.text.trim(),
                  });
                  if (ctx.mounted) Navigator.pop(ctx);
                  onRefresh();
                } catch (e) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text(e.toString())));
                }
              },
              child: const Text('Create'),
            ),
          ],
        ),
      ),
    );
  }
}

class _BatchRow extends StatelessWidget {
  final Batch batch;
  final bool isOwner;
  const _BatchRow({required this.batch, required this.isOwner});

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: () => context.push('/clans/${batch.clanId}'),
    child: Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: kColorSurface,
        borderRadius: BorderRadius.circular(14),
        boxShadow: const [BoxShadow(color: Color(0x0A000000), blurRadius: 8, offset: Offset(0, 2))],
      ),
      child: Row(children: [
        Container(
          width: 40, height: 40,
          decoration: BoxDecoration(
            color: kColorPrimary.withOpacity(0.12),
            borderRadius: BorderRadius.circular(10),
          ),
          child: const Icon(Icons.groups_rounded, color: kColorPrimary, size: 20),
        ),
        const SizedBox(width: 12),
        Expanded(child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(batch.name, style: const TextStyle(
              fontWeight: FontWeight.w700, fontSize: 14, color: kColorText)),
            Text('${batch.memberCount} members',
              style: const TextStyle(fontSize: 12, color: kColorMuted)),
          ],
        )),
        if (batch.inviteCode != null)
          GestureDetector(
            onTap: () {
              Clipboard.setData(ClipboardData(text: batch.inviteCode!));
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Invite code copied!')));
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: kColorEmerald.withOpacity(0.12),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(batch.inviteCode!, style: const TextStyle(
                color: kColorEmerald, fontWeight: FontWeight.w800,
                fontSize: 13, letterSpacing: 2)),
            ),
          ),
        if (isOwner) ...[
          const SizedBox(width: 8),
          GestureDetector(
            onTap: () => Navigator.push(context, MaterialPageRoute(
              builder: (_) => BatchScreen(
                batchId: batch.clanId.toString(),
                batchName: batch.name,
              ),
            )),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: kColorPrimary.withOpacity(0.10),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Text('Manage', style: TextStyle(
                color: kColorPrimary, fontWeight: FontWeight.w700, fontSize: 12)),
            ),
          ),
        ] else
          const Icon(Icons.chevron_right_rounded, color: kColorMuted, size: 18),
      ]),
    ),
  );
}

// ── Sessions Tab ─────────────────────────────────────────────────────────────

class _SessionsTab extends StatefulWidget {
  final String orgId;
  const _SessionsTab({required this.orgId});

  @override
  State<_SessionsTab> createState() => _SessionsTabState();
}

class _SessionsTabState extends State<_SessionsTab>
    with AutomaticKeepAliveClientMixin {
  List<TrainingSession> _sessions = [];
  bool _loading = true;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await ApiService.instance.get(
        '/api/organisations/org_sessions',
        query: {'orgId': widget.orgId},
      );
      setState(() {
        _sessions = (data['data'] as List? ?? [])
            .map((e) => TrainingSession.fromJson(e)).toList();
        _loading = false;
      });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    if (_loading) return const CenteredLoader();
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        ElevatedButton.icon(
          onPressed: () => _showSchedule(context),
          icon: const Icon(Icons.add, size: 18),
          label: const Text('Schedule Session'),
        ),
        const SizedBox(height: 16),
        if (_sessions.isEmpty)
          const EmptyView(message: 'No sessions scheduled',
            icon: Icons.calendar_today_outlined)
        else
          ..._sessions.map((s) => _SessionRow(session: s)),
      ],
    );
  }

  void _showSchedule(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: kColorSurface,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => _ScheduleSheet(orgId: widget.orgId, onCreated: _load),
    );
  }
}

class _SessionRow extends StatelessWidget {
  final TrainingSession session;
  const _SessionRow({required this.session});

  @override
  Widget build(BuildContext context) {
    final now      = DateTime.now();
    final isPast   = session.scheduledAt.isBefore(now);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: kColorSurface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: isPast ? const Color(0x0AFFFFFF) : kColorPrimary.withOpacity(0.2)),
      ),
      child: Row(children: [
        Icon(Icons.calendar_today_rounded,
          color: isPast ? kColorMuted : kColorPrimary, size: 20),
        const SizedBox(width: 12),
        Expanded(child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(session.title, style: TextStyle(
              fontWeight: FontWeight.w700, fontSize: 14,
              color: isPast ? kColorMuted : kColorText)),
            Text('${_formatDt(session.scheduledAt)} · ${session.durationMinutes}m',
              style: const TextStyle(fontSize: 12, color: kColorMuted)),
          ],
        )),
      ]),
    );
  }

  String _formatDt(DateTime d) {
    final now = DateTime.now();
    if (d.year == now.year && d.month == now.month && d.day == now.day) {
      return 'Today ${d.hour.toString().padLeft(2,'0')}:${d.minute.toString().padLeft(2,'0')}';
    }
    return '${d.day}/${d.month} ${d.hour.toString().padLeft(2,'0')}:${d.minute.toString().padLeft(2,'0')}';
  }
}

class _ScheduleSheet extends StatefulWidget {
  final String orgId;
  final VoidCallback onCreated;
  const _ScheduleSheet({required this.orgId, required this.onCreated});

  @override
  State<_ScheduleSheet> createState() => _ScheduleSheetState();
}

class _ScheduleSheetState extends State<_ScheduleSheet> {
  final _titleCtrl = TextEditingController();
  DateTime _when   = DateTime.now().add(const Duration(hours: 1));
  int _duration    = 60;
  bool _saving     = false;

  @override
  void dispose() {
    _titleCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.fromLTRB(24, 24, 24,
      MediaQuery.of(context).viewInsets.bottom + 24),
    child: Column(mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text('Schedule Session', style: TextStyle(
          fontSize: 18, fontWeight: FontWeight.w800, color: kColorText)),
        const SizedBox(height: 16),
        TextField(
          controller: _titleCtrl,
          decoration: const InputDecoration(labelText: 'Session Title'),
          textCapitalization: TextCapitalization.sentences,
        ),
        const SizedBox(height: 12),
        GestureDetector(
          onTap: _pickDate,
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Colors.black.withOpacity(0.04),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: Colors.black.withOpacity(0.1)),
            ),
            child: Row(children: [
              const Icon(Icons.event_outlined, size: 18, color: kColorPrimary),
              const SizedBox(width: 10),
              Text(_formatDt(_when), style: const TextStyle(color: kColorText)),
            ]),
          ),
        ),
        const SizedBox(height: 12),
        Row(children: [
          const Expanded(child: Text('Duration (min)',
            style: TextStyle(color: kColorMuted))),
          Row(children: [
            IconButton(
              icon: const Icon(Icons.remove_circle_outline, color: kColorPrimary),
              onPressed: _duration > 30 ? () => setState(() => _duration -= 15) : null,
            ),
            Text('$_duration', style: const TextStyle(
              color: kColorText, fontWeight: FontWeight.w800)),
            IconButton(
              icon: const Icon(Icons.add_circle_outline, color: kColorPrimary),
              onPressed: () => setState(() => _duration += 15),
            ),
          ]),
        ]),
        const SizedBox(height: 16),
        ElevatedButton(
          onPressed: _saving ? null : _submit,
          child: _saving
              ? const SizedBox(width: 20, height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2,  color: kColorText))
              : const Text('Schedule'),
        ),
      ],
    ),
  );

  String _formatDt(DateTime d) =>
    '${d.day}/${d.month}/${d.year} ${d.hour.toString().padLeft(2,'0')}:${d.minute.toString().padLeft(2,'0')}';

  Future<void> _pickDate() async {
    final date = await showDatePicker(
      context: context,
      initialDate: _when,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 90)),
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_when),
    );
    if (time == null) return;
    setState(() => _when = DateTime(
      date.year, date.month, date.day, time.hour, time.minute));
  }

  Future<void> _submit() async {
    if (_titleCtrl.text.trim().isEmpty) return;
    setState(() => _saving = true);
    try {
      await ApiService.instance.post('/api/organisations/org_sessions', {
        'orgId': widget.orgId,
        'title': _titleCtrl.text.trim(),
        'scheduled_at': _when.toIso8601String(),
        'duration_minutes': _duration,
      });
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

// ── Announcements Tab ─────────────────────────────────────────────────────────

class _AnnouncementsTab extends StatefulWidget {
  final String orgId;
  const _AnnouncementsTab({required this.orgId});

  @override
  State<_AnnouncementsTab> createState() => _AnnouncementsTabState();
}

class _AnnouncementsTabState extends State<_AnnouncementsTab>
    with AutomaticKeepAliveClientMixin {
  List<Map<String, dynamic>> _announcements = [];
  bool _loading = true;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await ApiService.instance.get(
        '/api/organisations/org_announcements',
        query: {'orgId': widget.orgId},
      );
      setState(() {
        _announcements = List<Map<String, dynamic>>.from(data['data'] ?? []);
        _loading = false;
      });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    if (_loading) return const CenteredLoader();
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        ElevatedButton.icon(
          onPressed: () => _showPost(context),
          icon: const Icon(Icons.campaign_outlined, size: 18),
          label: const Text('Post Announcement'),
        ),
        const SizedBox(height: 16),
        if (_announcements.isEmpty)
          const EmptyView(message: 'No announcements yet',
            icon: Icons.campaign_outlined)
        else
          ..._announcements.map((a) => _AnnouncementCard(data: a)),
      ],
    );
  }

  void _showPost(BuildContext context) {
    final titleCtrl = TextEditingController();
    final bodyCtrl  = TextEditingController();
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: kColorSurface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(24, 24, 24,
          MediaQuery.of(ctx).viewInsets.bottom + 24),
        child: Column(mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('Post Announcement', style: TextStyle(
              fontSize: 18, fontWeight: FontWeight.w800, color: kColorText)),
            const SizedBox(height: 16),
            TextField(controller: titleCtrl,
              decoration: const InputDecoration(labelText: 'Title')),
            const SizedBox(height: 10),
            TextField(controller: bodyCtrl, maxLines: 3,
              decoration: const InputDecoration(labelText: 'Message')),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: () async {
                if (titleCtrl.text.trim().isEmpty) return;
                try {
                  await ApiService.instance.post(
                    '/api/organisations/announcements', {
                    'orgId': widget.orgId,
                    'title': titleCtrl.text.trim(),
                    'body': bodyCtrl.text.trim(),
                  });
                  if (ctx.mounted) Navigator.pop(ctx);
                  _load();
                } catch (e) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text(e.toString())));
                }
              },
              child: const Text('Post'),
            ),
          ],
        ),
      ),
    );
  }
}

class _AnnouncementCard extends StatelessWidget {
  final Map<String, dynamic> data;
  const _AnnouncementCard({required this.data});

  @override
  Widget build(BuildContext context) {
    final isPinned = data['pinned'] == true || data['pinned'] == 1;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: isPinned ? kColorAmber.withOpacity(0.06) : kColorSurface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: isPinned ? kColorAmber.withOpacity(0.25) : const Color(0x18000000)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          if (isPinned) ...[
            const Icon(Icons.push_pin_rounded, color: kColorAmber, size: 14),
            const SizedBox(width: 6),
          ],
          Expanded(child: Text(data['title']?.toString() ?? '',
            style: const TextStyle(
              fontWeight: FontWeight.w700, fontSize: 14,  color: kColorText))),
        ]),
        if ((data['body']?.toString() ?? '').isNotEmpty) ...[
          const SizedBox(height: 6),
          Text(data['body']?.toString() ?? '',
            style: const TextStyle(color: kColorMuted, fontSize: 13)),
        ],
        const SizedBox(height: 8),
        Text(data['author']?.toString() ?? '',
          style: const TextStyle(color: kColorMuted, fontSize: 11)),
      ]),
    );
  }
}
