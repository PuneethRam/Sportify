import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../core/theme.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_service.dart';
import '../../widgets/invite_share.dart';
import '../../widgets/loading_screen.dart';
import 'matches_screen.dart';
import 'leaderboard_screen.dart';
import 'series_screen.dart';
import 'create_tournament_screen.dart';

class ClanDetailScreen extends StatefulWidget {
  final String clanId;
  const ClanDetailScreen({super.key, required this.clanId});

  @override
  State<ClanDetailScreen> createState() => _ClanDetailScreenState();
}

class _ClanDetailScreenState extends State<ClanDetailScreen>
    with TickerProviderStateMixin {
  late final TabController _tabs;
  Map<String, dynamic>? _clan;
  bool _loading = true;
  bool _isAdmin = false;
  bool _leaving = false;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 3, vsync: this);
    _tabs.addListener(() { if (mounted) setState(() {}); });
    _load();
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final data = await ApiService.instance.get(
          '/api/clans/get_clan', query: {'id': widget.clanId, 'clanId': widget.clanId});
      final raw = data['data'];
      final clan = raw is List
          ? (raw.isNotEmpty ? raw.first : null)
          : raw ?? data;
      if (clan is Map) setState(() { _clan = clan.cast<String, dynamic>(); });
    } catch (_) {}
    try {
      final data = await ApiService.instance.get(
        '/api/clans/checkadmin',
        query: {'clanId': widget.clanId},
        cached: false,
      );
      if (mounted) setState(() => _isAdmin = data['isAdmin'] == true || data['isAdmin'] == 1);
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _leaveClan() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: kColorSurface,
        title: const Text('Leave Clan?', style: TextStyle(color: kColorText)),
        content: const Text('You will be removed from this clan.',
            style: TextStyle(color: kColorMuted)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: kColorRose),
            child: const Text('Leave')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _leaving = true);
    try {
      await ApiService.instance.post('/api/clans/leave_clan', {'clanId': widget.clanId});
      if (mounted) context.pop();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
        setState(() => _leaving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Scaffold(body: CenteredLoader());

    final clanName = _clan?['name'] ?? 'Clan';
    final clanRank = _clan?['clan_rank'];
    final topPad   = MediaQuery.of(context).padding.top;

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        body: Column(children: [
          _buildHero(context, clanName, clanRank, topPad),
          _buildTabRow(),
          Expanded(
            child: TabBarView(
              controller: _tabs,
              children: [
                _OverviewTab(clanId: widget.clanId, isAdmin: _isAdmin),
                _ScheduleTab(clanId: widget.clanId),
                _AnnouncementsTab(clanId: widget.clanId),
              ],
            ),
          ),
        ]),
      ),
    );
  }

  Widget _buildHero(BuildContext context, String clanName, dynamic clanRank, double topPad) {
    final initial = clanName.isNotEmpty ? clanName[0].toUpperCase() : '?';
    return Container(
      height: 216 + topPad,
      width: double.infinity,
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF0E0B22), Color(0xFF130F2D), Color(0xFF0A0718)],
        ),
      ),
      child: Stack(children: [
        // Blob top-right
        Positioned(top: -40, right: -40,
          child: Container(width: 160, height: 160,
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              color: Color(0x1E3B82F6),
            ))),
        // Blob bottom-left
        Positioned(bottom: 0, left: -20,
          child: Container(width: 120, height: 120,
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              color: Color(0x120D9488),
            ))),
        // Bottom fade
        Positioned(left: 0, right: 0, bottom: 0,
          child: Container(height: 100,
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Colors.transparent, Color(0xB3000000)],
              )))),
        // Back button
        Positioned(top: topPad + 4, left: 4,
          child: IconButton(
            icon: const Icon(Icons.arrow_back_ios_new_rounded,
                color: Colors.white, size: 20),
            onPressed: () => context.pop(),
          )),
        // Share invite (admins) + refresh
        Positioned(top: topPad + 4, right: 4,
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            if (_isAdmin && int.tryParse(widget.clanId) != null)
              InviteShareButton(
                type: _clan?['type'] == 'batch' ? 'batch' : 'clan',
                id: int.parse(widget.clanId),
                name: clanName,
                color: Colors.white70,
              ),
            IconButton(
              icon: const Icon(Icons.refresh_outlined,
                  color: Colors.white54, size: 20),
              onPressed: _load,
            ),
          ])),
        // Bottom content
        Positioned(left: 20, right: 20, bottom: 18,
          child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
            // Clan avatar square
            Container(
              width: 68, height: 68,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(16),
                gradient: const LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [Color(0xFF60A5FA), Color(0xFF0D9488)],
                ),
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFF3B82F6).withOpacity(0.4),
                    blurRadius: 16),
                ],
              ),
              alignment: Alignment.center,
              child: Text(initial, style: const TextStyle(
                color: Colors.white, fontSize: 26, fontWeight: FontWeight.w900)),
            ),
            const SizedBox(width: 14),
            // Name + rank
            Expanded(child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(clanName,
                  style: const TextStyle(
                    color: Colors.white, fontSize: 22, fontWeight: FontWeight.w900,
                    letterSpacing: 0.3, height: 1.1),
                  overflow: TextOverflow.ellipsis),
                const SizedBox(height: 6),
                if (clanRank != null)
                  Row(mainAxisSize: MainAxisSize.min, children: [
                    const Icon(Icons.emoji_events_rounded,
                        color: Color(0xFFFBBF24), size: 14),
                    const SizedBox(width: 4),
                    const Text('Global Rank', style: TextStyle(
                        color: Colors.white70, fontSize: 12)),
                    const SizedBox(width: 4),
                    Text('#$clanRank', style: const TextStyle(
                        color: Color(0xFFFBBF24), fontSize: 12,
                        fontWeight: FontWeight.w800)),
                  ]),
              ],
            )),
            // Leave button
            GestureDetector(
              onTap: _leaving ? null : _leaveClan,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: kColorRose.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: kColorRose.withOpacity(0.30)),
                ),
                child: _leaving
                    ? const SizedBox(width: 14, height: 14,
                        child: CircularProgressIndicator(strokeWidth: 2,
                          valueColor: AlwaysStoppedAnimation(kColorRose)))
                    : Row(mainAxisSize: MainAxisSize.min, children: const [
                        Icon(Icons.logout_rounded, color: kColorRose, size: 14),
                        SizedBox(width: 4),
                        Text('Leave', style: TextStyle(
                          color: kColorRose, fontSize: 12, fontWeight: FontWeight.w700)),
                      ]),
              ),
            ),
          ])),
      ]),
    );
  }

  Widget _buildTabRow() {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: kColorSurface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: kColorMuted.withOpacity(0.12)),
      ),
      child: Row(children: [
        _tabPill('Overview', 0),
        _tabPill('Schedule', 1),
        _tabPill('Announcements', 2),
      ]),
    );
  }

  Widget _tabPill(String label, int index) {
    final selected = _tabs.index == index;
    return Expanded(child: GestureDetector(
      onTap: () => _tabs.animateTo(index),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(vertical: 8),
        decoration: BoxDecoration(
          color: selected ? kColorEmerald : Colors.transparent,
          borderRadius: BorderRadius.circular(10),
          boxShadow: selected ? [
            BoxShadow(color: kColorEmerald.withOpacity(0.35),
                blurRadius: 8, offset: const Offset(0, 2))
          ] : null,
        ),
        alignment: Alignment.center,
        child: Text(label, style: TextStyle(
          color: selected ? Colors.white : kColorMuted,
          fontSize: 11, fontWeight: FontWeight.w600)),
      ),
    ));
  }
}

// ── Sub-page scaffold ─────────────────────────────────────────────────────────

class _SubPage extends StatelessWidget {
  final String title;
  final Widget child;
  const _SubPage({required this.title, required this.child});
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(title)),
    body: child,
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

class _OverviewTab extends StatelessWidget {
  final String clanId;
  final bool isAdmin;
  const _OverviewTab({required this.clanId, required this.isAdmin});

  void _navigate(BuildContext context, String name) {
    late Widget content;
    late String title;
    switch (name) {
      case 'Members':
        title = 'Members';
        content = _MembersTab(clanId: clanId);
        break;
      case 'Matches':
        title = 'Matches';
        content = MatchesTab(clanId: clanId, isAdmin: isAdmin);
        break;
      case 'Leaderboard':
        title = 'Leaderboard';
        content = LeaderboardTab(clanId: clanId);
        break;
      case 'Tournaments':
        title = 'Tournaments';
        content = TournamentsTab(clanId: clanId, isAdmin: isAdmin);
        break;
      default:
        title = 'Series';
        content = SeriesScreen(clanId: clanId, isAdmin: isAdmin);
    }
    Navigator.push(context,
        MaterialPageRoute(builder: (_) => _SubPage(title: title, child: content)));
  }

  @override
  Widget build(BuildContext context) {
    final features = [
      (Icons.group_rounded,        'Members',     'View and manage clan members',
          const Color(0xFF3B82F6), const Color(0xFF0D9488)),
      (Icons.calendar_month_rounded, 'Matches',   'Schedule and track match history',
          const Color(0xFF10B981), const Color(0xFF0D9488)),
      (Icons.leaderboard_rounded,  'Leaderboard', 'Rankings and player statistics',
          const Color(0xFFF59E0B), const Color(0xFFF97316)),
      (Icons.emoji_events_rounded, 'Tournaments', 'Compete in clan tournaments',
          const Color(0xFF8B5CF6), const Color(0xFFEC4899)),
      (Icons.bar_chart_rounded,    'Series',      'Multi-match series and progress',
          const Color(0xFF3B82F6), const Color(0xFF06B6D4)),
    ];

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      children: [
        const Text('QUICK ACCESS', style: TextStyle(
          color: kColorMuted, fontSize: 10, fontWeight: FontWeight.w700,
          letterSpacing: 1.5)),
        const SizedBox(height: 12),
        ...features.map((f) => Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: _FeatureCard(
            icon: f.$1,
            name: f.$2,
            desc: f.$3,
            c1: f.$4,
            c2: f.$5,
            onTap: () => _navigate(context, f.$2),
          ),
        )),
      ],
    );
  }
}

class _FeatureCard extends StatelessWidget {
  final IconData icon;
  final String name;
  final String desc;
  final Color c1;
  final Color c2;
  final VoidCallback onTap;
  const _FeatureCard({
    required this.icon, required this.name, required this.desc,
    required this.c1, required this.c2, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(18),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: kColorSurface,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: kColorMuted.withOpacity(0.08)),
          boxShadow: const [
            BoxShadow(color: Color(0x08000000), blurRadius: 8, offset: Offset(0, 2)),
          ],
        ),
        child: Row(children: [
          Container(
            width: 48, height: 48,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [c1, c2],
              ),
              boxShadow: [
                BoxShadow(color: c1.withOpacity(0.3), blurRadius: 8, offset: const Offset(0, 2)),
              ],
            ),
            alignment: Alignment.center,
            child: Icon(icon, color: Colors.white, size: 22),
          ),
          const SizedBox(width: 14),
          Expanded(child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(name, style: const TextStyle(
                color: kColorText, fontWeight: FontWeight.w700, fontSize: 14)),
              const SizedBox(height: 3),
              Text(desc, style: const TextStyle(
                color: kColorMuted, fontSize: 12, height: 1.3)),
            ],
          )),
          const SizedBox(width: 8),
          const Icon(Icons.chevron_right_rounded, color: kColorMuted, size: 20),
        ]),
      ),
    );
  }
}

// ── Schedule Tab ──────────────────────────────────────────────────────────────

class _ScheduleTab extends StatefulWidget {
  final String clanId;
  const _ScheduleTab({required this.clanId});
  @override
  State<_ScheduleTab> createState() => _ScheduleTabState();
}

class _ScheduleTabState extends State<_ScheduleTab>
    with AutomaticKeepAliveClientMixin {
  List<Map<String, dynamic>> _sessions = [];
  bool _loading = true;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    try {
      final data = await ApiService.instance.get(
        '/api/organisations/sessions',
        query: {'batchId': widget.clanId},
      );
      setState(() {
        _sessions = List<Map<String, dynamic>>.from(
            data['sessions'] ?? data['data'] ?? []);
        _loading = false;
      });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  static String _fmtDate(String raw) {
    try {
      final d = DateTime.parse(raw);
      const mo = ['Jan','Feb','Mar','Apr','May','Jun',
                   'Jul','Aug','Sep','Oct','Nov','Dec'];
      return '${mo[d.month-1]} ${d.day}, ${d.year}  '
             '${d.hour.toString().padLeft(2,'0')}:${d.minute.toString().padLeft(2,'0')}';
    } catch (_) { return raw; }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    if (_loading) return const CenteredLoader();
    if (_sessions.isEmpty) {
      return Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
        Icon(Icons.calendar_today_rounded, size: 44,
            color: kColorMuted.withOpacity(0.3)),
        const SizedBox(height: 12),
        const Text('No sessions scheduled yet.',
            style: TextStyle(color: kColorMuted, fontSize: 14)),
      ]));
    }

    final now = DateTime.now();
    final upcoming = _sessions.where((s) {
      try { return DateTime.parse(s['scheduled_at'].toString()).isAfter(now); }
      catch (_) { return true; }
    }).toList();
    final past = _sessions.where((s) {
      try { return DateTime.parse(s['scheduled_at'].toString()).isBefore(now); }
      catch (_) { return false; }
    }).toList();

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      children: [
        if (upcoming.isNotEmpty) ...[
          const Text('UPCOMING', style: TextStyle(
            color: kColorEmerald, fontSize: 10, fontWeight: FontWeight.w700,
            letterSpacing: 1.2)),
          const SizedBox(height: 8),
          ...upcoming.map((s) => _SessionCard(session: s, upcoming: true, fmtDate: _fmtDate)),
          const SizedBox(height: 16),
        ],
        if (past.isNotEmpty) ...[
          const Text('PAST', style: TextStyle(
            color: kColorMuted, fontSize: 10, fontWeight: FontWeight.w700,
            letterSpacing: 1.2)),
          const SizedBox(height: 8),
          Opacity(opacity: 0.55, child: Column(
            children: past.reversed
                .map((s) => _SessionCard(session: s, upcoming: false, fmtDate: _fmtDate))
                .toList())),
        ],
      ],
    );
  }
}

class _SessionCard extends StatelessWidget {
  final Map<String, dynamic> session;
  final bool upcoming;
  final String Function(String) fmtDate;
  const _SessionCard({required this.session, required this.upcoming, required this.fmtDate});

  @override
  Widget build(BuildContext context) {
    final title    = session['title']?.toString() ?? 'Session';
    final at       = session['scheduled_at']?.toString() ?? '';
    final duration = session['duration_minutes']?.toString();
    final notes    = session['notes']?.toString();

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: kColorSurface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: upcoming ? kColorEmerald.withOpacity(0.2) : kColorMuted.withOpacity(0.08)),
        boxShadow: const [
          BoxShadow(color: Color(0x08000000), blurRadius: 6, offset: Offset(0, 2)),
        ],
      ),
      child: Column(children: [
        if (upcoming)
          Container(height: 2,
            decoration: const BoxDecoration(
              gradient: LinearGradient(colors: [Color(0xFF10B981), Color(0xFF0D9488)]),
              borderRadius: BorderRadius.vertical(top: Radius.circular(14)),
            )),
        Padding(
          padding: const EdgeInsets.all(14),
          child: Row(children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: upcoming ? kColorEmerald.withOpacity(0.1) : kColorMuted.withOpacity(0.06),
                borderRadius: BorderRadius.circular(12),
                border: upcoming ? Border.all(color: kColorEmerald.withOpacity(0.2)) : null,
              ),
              child: Icon(Icons.calendar_today_rounded, size: 18,
                  color: upcoming ? kColorEmerald : kColorMuted),
            ),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: const TextStyle(
                color: kColorText, fontWeight: FontWeight.w700, fontSize: 13)),
              if (at.isNotEmpty) ...[
                const SizedBox(height: 3),
                Text(fmtDate(at), style: TextStyle(
                  color: upcoming ? kColorEmerald : kColorMuted,
                  fontSize: 11, fontWeight: FontWeight.w500)),
              ],
              if (duration != null) ...[
                const SizedBox(height: 2),
                Text('$duration min', style: const TextStyle(color: kColorMuted, fontSize: 11)),
              ],
              if (notes != null && notes.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(notes, style: const TextStyle(
                  color: kColorMuted, fontSize: 11, fontStyle: FontStyle.italic)),
              ],
            ])),
          ]),
        ),
      ]),
    );
  }
}

// ── Announcements Tab ─────────────────────────────────────────────────────────

class _AnnouncementsTab extends StatefulWidget {
  final String clanId;
  const _AnnouncementsTab({required this.clanId});
  @override
  State<_AnnouncementsTab> createState() => _AnnouncementsTabState();
}

class _AnnouncementsTabState extends State<_AnnouncementsTab>
    with AutomaticKeepAliveClientMixin {
  List<Map<String, dynamic>> _items = [];
  bool _loading = true;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    try {
      final data = await ApiService.instance.get(
        '/api/organisations/announcements',
        query: {'batchId': widget.clanId},
      );
      setState(() {
        _items = List<Map<String, dynamic>>.from(
            data['announcements'] ?? data['data'] ?? []);
        _loading = false;
      });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  static String _fmtDate(String raw) {
    try {
      final d = DateTime.parse(raw);
      const mo = ['Jan','Feb','Mar','Apr','May','Jun',
                   'Jul','Aug','Sep','Oct','Nov','Dec'];
      return '${mo[d.month-1]} ${d.day}, ${d.year}';
    } catch (_) { return raw.length > 10 ? raw.substring(0, 10) : raw; }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    if (_loading) return const CenteredLoader();
    if (_items.isEmpty) {
      return Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
        Icon(Icons.notifications_outlined, size: 44,
            color: kColorMuted.withOpacity(0.3)),
        const SizedBox(height: 12),
        const Text('No announcements yet.',
            style: TextStyle(color: kColorMuted, fontSize: 14)),
      ]));
    }
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      itemCount: _items.length,
      itemBuilder: (_, i) {
        final item  = _items[i];
        final title = item['title']?.toString() ?? '';
        final body  = item['body']?.toString() ?? item['message']?.toString() ?? '';
        final at    = item['created_at']?.toString() ?? '';
        return Container(
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: kColorSurface,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: kColorMuted.withOpacity(0.08)),
            boxShadow: const [
              BoxShadow(color: Color(0x08000000), blurRadius: 6, offset: Offset(0, 2)),
            ],
          ),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: kColorAmber.withOpacity(0.10),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(Icons.notifications_rounded, size: 18, color: kColorAmber),
            ),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              if (title.isNotEmpty)
                Text(title, style: const TextStyle(
                  color: kColorText, fontWeight: FontWeight.w700, fontSize: 13)),
              if (title.isNotEmpty && body.isNotEmpty) const SizedBox(height: 4),
              if (body.isNotEmpty)
                Text(body, style: const TextStyle(
                  color: kColorMuted, fontSize: 12, height: 1.4)),
              if (at.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(_fmtDate(at), style: const TextStyle(
                  color: kColorMuted, fontSize: 10)),
              ],
            ])),
          ]),
        );
      },
    );
  }
}

// ── Members Tab ──────────────────────────────────────────────────────────────

class _MembersTab extends StatefulWidget {
  final String clanId;
  const _MembersTab({required this.clanId});

  @override
  State<_MembersTab> createState() => _MembersTabState();
}

class _MembersTabState extends State<_MembersTab>
    with AutomaticKeepAliveClientMixin {
  List<Map<String, dynamic>> _members = [];
  bool _loading = true;
  String? _inviteCode;

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
        '/api/clans/get_clanmembers',
        query: {'clanId': widget.clanId},
      );
      setState(() {
        _members = List<Map<String, dynamic>>.from(data['data'] ?? data['members'] ?? []);
        _inviteCode = data['inviteCode']?.toString();
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
        if (_inviteCode != null)
          Container(
            padding: const EdgeInsets.all(14),
            margin: const EdgeInsets.only(bottom: 16),
            decoration: BoxDecoration(
              color: kColorEmerald.withOpacity(0.08),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: kColorEmerald.withOpacity(0.25)),
            ),
            child: Row(children: [
              const Icon(Icons.link_rounded, color: kColorEmerald, size: 18),
              const SizedBox(width: 10),
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Invite Code', style: TextStyle(
                  color: kColorEmerald, fontSize: 11, fontWeight: FontWeight.w700,
                  letterSpacing: 0.8)),
                Text(_inviteCode!, style: const TextStyle(
                  color: kColorText, fontWeight: FontWeight.w800, fontSize: 18,
                  letterSpacing: 4)),
              ]),
            ]),
          ),
        ..._members.asMap().entries.map((entry) {
          final idx     = entry.key;
          final m       = entry.value;
          final name    = m['name']?.toString() ?? 'Player';
          final role    = m['role']?.toString() ?? 'member';
          final uid     = m['user_id']?.toString() ?? m['userId']?.toString() ?? '';
          final isAdmin = role == 'admin';
          final initial = name.isNotEmpty ? name[0].toUpperCase() : '?';
          final avatarColor = isAdmin ? kColorAmber : kColorPrimary;

          return Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: InkWell(
              borderRadius: BorderRadius.circular(16),
              onTap: uid.isNotEmpty
                  ? () => context.push('/clans/${widget.clanId}/player/$uid')
                  : null,
              child: Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: kColorSurface,
                  borderRadius: BorderRadius.circular(16),
                  boxShadow: const [
                    BoxShadow(color: Color(0x0A000000), blurRadius: 8, offset: Offset(0, 2)),
                  ],
                ),
                child: Row(children: [
                  SizedBox(
                    width: 26,
                    child: Text('${idx + 1}',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: kColorMuted, fontSize: 12, fontWeight: FontWeight.w600)),
                  ),
                  const SizedBox(width: 10),
                  Container(
                    width: 44, height: 44,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: avatarColor.withOpacity(isAdmin ? 0.18 : 0.12),
                      border: isAdmin
                          ? Border.all(color: kColorAmber.withOpacity(0.45), width: 1.5)
                          : null,
                    ),
                    alignment: Alignment.center,
                    child: Text(initial, style: TextStyle(
                      color: avatarColor, fontSize: 18, fontWeight: FontWeight.w800)),
                  ),
                  const SizedBox(width: 14),
                  Expanded(child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(name,
                        style: const TextStyle(
                          color: kColorText, fontWeight: FontWeight.w700, fontSize: 14),
                        overflow: TextOverflow.ellipsis),
                      const SizedBox(height: 4),
                      Text(isAdmin ? 'Admin' : 'Member',
                        style: TextStyle(
                          color: isAdmin ? kColorAmber : kColorMuted,
                          fontSize: 11, fontWeight: FontWeight.w600)),
                    ],
                  )),
                  if (isAdmin)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                      decoration: BoxDecoration(
                        color: kColorAmber.withOpacity(0.12),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: kColorAmber.withOpacity(0.30)),
                      ),
                      child: Row(mainAxisSize: MainAxisSize.min, children: const [
                        Icon(Icons.star_rounded, color: kColorAmber, size: 11),
                        SizedBox(width: 3),
                        Text('Admin', style: TextStyle(
                          color: kColorAmber, fontSize: 11, fontWeight: FontWeight.w700)),
                      ]),
                    )
                  else
                    const Icon(Icons.chevron_right_rounded, color: kColorMuted, size: 18),
                ]),
              ),
            ),
          );
        }),
      ],
    );
  }
}

// ── Tournaments Tab ──────────────────────────────────────────────────────────

class TournamentsTab extends StatefulWidget {
  final String clanId;
  final bool isAdmin;
  const TournamentsTab({super.key, required this.clanId, required this.isAdmin});

  @override
  State<TournamentsTab> createState() => _TournamentsTabState();
}

class _TournamentsTabState extends State<TournamentsTab>
    with AutomaticKeepAliveClientMixin {
  List<Map<String, dynamic>> _tournaments = [];
  bool _loading = true;
  String _statusFilter = 'all';
  String _typeFilter   = 'all';
  String _formatFilter = 'all';
  Map<String, dynamic>? _joinTournament;
  bool _showHost = false;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final data = await ApiService.instance.get(
        '/api/clans/tournaments/get_tournaments',
        query: {'id': widget.clanId},
      );
      setState(() {
        _tournaments = List<Map<String, dynamic>>.from(data['data'] ?? []);
        _loading    = false;
      });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  List<Map<String, dynamic>> get _openList =>
      _tournaments.where((t) => t['status'] == 'open').toList();
  List<Map<String, dynamic>> get _regularList =>
      _tournaments.where((t) => t['status'] != 'open').toList();
  List<Map<String, dynamic>> get _filtered => _regularList.where((t) {
    if (_statusFilter != 'all' && t['status'] != _statusFilter) return false;
    if (_typeFilter   != 'all' && t['tournament_type'] != _typeFilter) return false;
    if (_formatFilter != 'all' && t['format'] != _formatFilter) return false;
    return true;
  }).toList();

  int get _openCount => _openList.length;
  int get _liveCount => _regularList.where((t) => t['status'] == 'ongoing').length;
  int get _doneCount => _regularList.where((t) => t['status'] == 'completed').length;

  Future<void> _deleteTournament(dynamic tId) async {
    try {
      await ApiService.instance.delete(
        '/api/clans/tournaments/delete_tournament?tournamentId=$tId&clanId=${widget.clanId}',
      );
      setState(() => _tournaments.removeWhere((t) =>
          (t['tournament_id'] ?? t['id'])?.toString() == tId.toString()));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    if (_loading) return const CenteredLoader();

    final showOpen    = _statusFilter == 'all' || _statusFilter == 'open';
    final showRegular = _statusFilter != 'open';
    final displayOpen    = showOpen    ? _openList  : <Map<String, dynamic>>[];
    final displayRegular = showRegular ? _filtered  : <Map<String, dynamic>>[];
    final isEmpty = displayOpen.isEmpty && displayRegular.isEmpty;

    return Stack(children: [
      RefreshIndicator(
        onRefresh: _load,
        color: kColorPrimary,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 80),
          children: [
            if (_tournaments.isNotEmpty) ...[
              Row(children: [
                _statBox('Open', _openCount, const Color(0xFF7C3AED)),
                const SizedBox(width: 8),
                _statBox('Live', _liveCount, kColorEmerald),
                const SizedBox(width: 8),
                _statBox('Done', _doneCount, kColorMuted),
              ]),
              const SizedBox(height: 12),
            ],
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(children: [
                for (final tab in [
                  ('all', 'All'), ('open', 'Open'), ('ongoing', 'Live'), ('completed', 'Done'),
                ])
                  _pill(tab.$2, _statusFilter == tab.$1, () => setState(() => _statusFilter = tab.$1),
                      badge: tab.$1 == 'open' && _openCount > 0 ? '$_openCount' : null),
              ]),
            ),
            if (_statusFilter != 'open') ...[
              const SizedBox(height: 6),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(children: [
                  for (final t in [('all', 'All Types'), ('singles', 'Singles'), ('doubles', 'Doubles')])
                    _pill(t.$2, _typeFilter == t.$1, () => setState(() => _typeFilter = t.$1)),
                  Container(width: 1, height: 20, margin: const EdgeInsets.symmetric(horizontal: 4),
                      color: kColorMuted.withOpacity(0.2)),
                  for (final f in [
                    ('all', 'All'), ('knockout', 'KO'), ('round_robin', 'Round Robin'), ('group_knockout', 'Group+KO'),
                  ])
                    _pill(f.$2, _formatFilter == f.$1, () => setState(() => _formatFilter = f.$1)),
                ]),
              ),
            ],
            const SizedBox(height: 12),
            if (widget.isAdmin) ...[
              Row(children: [
                Expanded(child: ElevatedButton.icon(
                  onPressed: _goCreate,
                  icon: const Icon(Icons.add, size: 16),
                  label: const Text('Create'),
                )),
                const SizedBox(width: 8),
                Expanded(child: ElevatedButton.icon(
                  onPressed: () => setState(() => _showHost = true),
                  icon: const Icon(Icons.bolt_rounded, size: 16),
                  label: const Text('Host'),
                  style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF7C3AED)),
                )),
              ]),
              const SizedBox(height: 12),
            ],
            if (isEmpty)
              _emptyView()
            else ...[
              if (displayOpen.isNotEmpty) ...[
                if (_statusFilter == 'all' && displayRegular.isNotEmpty)
                  const Padding(
                    padding: EdgeInsets.only(bottom: 6),
                    child: Text('Open for Registration', style: TextStyle(
                      fontSize: 10, fontWeight: FontWeight.w700, color: kColorMuted, letterSpacing: 0.5)),
                  ),
                ...displayOpen.map((t) => Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: _OpenTournamentCard(
                    tournament: t, isAdmin: widget.isAdmin,
                    onJoin: (t) => setState(() => _joinTournament = t),
                    onStarted: _load,
                  ),
                )),
                if (_statusFilter == 'all' && displayRegular.isNotEmpty) const Divider(height: 20),
              ],
              ...displayRegular.map((t) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _TournamentCard(
                  data: t, clanId: widget.clanId, isAdmin: widget.isAdmin,
                  onDelete: _deleteTournament,
                ),
              )),
            ],
          ],
        ),
      ),
      if (_showHost)
        _HostModal(
          clanId: widget.clanId,
          onClose: () => setState(() => _showHost = false),
          onCreated: () { setState(() => _showHost = false); _load(); },
        ),
      if (_joinTournament != null)
        _JoinModal(
          tournament: _joinTournament!,
          onClose: () => setState(() => _joinTournament = null),
          onJoined: () { setState(() => _joinTournament = null); _load(); },
        ),
    ]);
  }

  Widget _statBox(String label, int count, Color color) => Expanded(
    child: Container(
      padding: const EdgeInsets.symmetric(vertical: 10),
      decoration: BoxDecoration(
        color: color.withOpacity(0.07),
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(color: color.withOpacity(0.08), blurRadius: 6, offset: const Offset(0, 2)),
        ],
      ),
      child: Column(children: [
        Text('$count', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: color)),
        Text(label, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: kColorMuted, letterSpacing: 0.5)),
      ]),
    ),
  );

  Widget _pill(String label, bool selected, VoidCallback onTap, {String? badge}) =>
    GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(right: 6),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: selected ? kColorPrimary : kColorPrimary.withOpacity(0.08),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Text(label, style: TextStyle(
            color: selected ? Colors.white : kColorPrimary,
            fontSize: 12, fontWeight: FontWeight.w600)),
          if (badge != null) ...[
            const SizedBox(width: 4),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
              decoration: BoxDecoration(
                color: selected ? Colors.white.withOpacity(0.25) : kColorPrimary.withOpacity(0.15),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(badge, style: TextStyle(
                fontSize: 9, fontWeight: FontWeight.w800,
                color: selected ? Colors.white : kColorPrimary)),
            ),
          ],
        ]),
      ),
    );

  Widget _emptyView() => Container(
    padding: const EdgeInsets.all(32),
    decoration: const BoxDecoration(
      color: kColorSurface,
      borderRadius: BorderRadius.all(Radius.circular(16)),
      boxShadow: [
        BoxShadow(color: Color(0x08000000), blurRadius: 6, offset: Offset(0, 2)),
      ],
    ),
    child: Column(children: [
      Icon(Icons.emoji_events_outlined, size: 40, color: kColorMuted.withOpacity(0.4)),
      const SizedBox(height: 12),
      const Text('No tournaments found', style: TextStyle(fontWeight: FontWeight.w700, color: kColorText, fontSize: 14)),
      const SizedBox(height: 4),
      Text(
        _statusFilter != 'all' || _typeFilter != 'all' || _formatFilter != 'all'
            ? 'Try changing your filters' : 'No tournaments yet',
        style: const TextStyle(color: kColorMuted, fontSize: 12),
      ),
    ]),
  );

  void _goCreate() async {
    final created = await Navigator.push<bool>(context, MaterialPageRoute(
      builder: (_) => CreateTournamentScreen(clanId: widget.clanId),
    ));
    if (created == true) _load();
  }
}

// ── Open Tournament Card ──────────────────────────────────────────────────────

class _OpenTournamentCard extends StatefulWidget {
  final Map<String, dynamic> tournament;
  final bool isAdmin;
  final Function(Map<String, dynamic>) onJoin;
  final VoidCallback onStarted;
  const _OpenTournamentCard({required this.tournament, required this.isAdmin,
      required this.onJoin, required this.onStarted});
  @override
  State<_OpenTournamentCard> createState() => _OpenTournamentCardState();
}

class _OpenTournamentCardState extends State<_OpenTournamentCard> {
  int?  _count;
  bool  _isTeamMode = false;
  bool  _starting   = false;
  static const _purple = Color(0xFF7C3AED);

  @override
  void initState() { super.initState(); _fetchCount(); }

  Future<void> _fetchCount() async {
    try {
      final id = (widget.tournament['tournament_id'] ?? widget.tournament['id'])?.toString() ?? '';
      final data = await ApiService.instance.get(
        '/api/clans/tournaments/hosted_registrations', query: {'tournamentId': id});
      if (!mounted) return;
      final tm = (data['tournament']?['registration_mode'] ?? '') == 'teams';
      setState(() {
        _isTeamMode = tm;
        _count = tm ? (data['teams'] as List?)?.length ?? 0 : (data['registrations'] as List?)?.length ?? 0;
      });
    } catch (_) {}
  }

  Future<void> _start() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: kColorSurface,
        title: const Text('Start Tournament?', style: TextStyle(color: kColorText)),
        content: const Text('Registrations will close and the bracket will be generated.',
            style: TextStyle(color: kColorMuted)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Start')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _starting = true);
    try {
      final id = (widget.tournament['tournament_id'] ?? widget.tournament['id'])?.toString() ?? '';
      await ApiService.instance.post('/api/clans/tournaments/start_hosted', {'tournamentId': id});
      widget.onStarted();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
      setState(() => _starting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.tournament;
    final name   = (t['tournament_name'] ?? t['name'])?.toString() ?? 'Tournament';
    final type   = t['tournament_type']?.toString() ?? 'singles';
    final format = t['format']?.toString() ?? 'knockout';
    const fLabels = {'knockout': 'Knockout', 'round_robin': 'Round Robin', 'group_knockout': 'Group+KO'};

    return Container(
      decoration: BoxDecoration(
        color: _purple.withOpacity(0.06),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(color: _purple.withOpacity(0.12), blurRadius: 10, offset: const Offset(0, 3)),
          const BoxShadow(color: Color(0x04000000), blurRadius: 2),
        ],
      ),
      child: IntrinsicHeight(child: Row(children: [
        Container(
          width: 3,
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter, end: Alignment.bottomCenter,
              colors: [Color(0xFF7C3AED), Color(0xFF2563EB)]),
            borderRadius: BorderRadius.horizontal(left: Radius.circular(16)),
          ),
        ),
        Expanded(child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(child: Text(name, style: const TextStyle(
                fontWeight: FontWeight.w800, fontSize: 15, color: kColorText))),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: _purple.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: _purple.withOpacity(0.3)),
                ),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Container(width: 6, height: 6, margin: const EdgeInsets.only(right: 4),
                      decoration: const BoxDecoration(color: _purple, shape: BoxShape.circle)),
                  const Text('Open', style: TextStyle(color: _purple, fontSize: 10, fontWeight: FontWeight.w700)),
                ]),
              ),
            ]),
            const SizedBox(height: 8),
            Row(children: [
              Expanded(child: Wrap(spacing: 5, runSpacing: 4, children: [
                _oc(type == 'doubles' ? 'Doubles' : 'Singles'),
                _oc(fLabels[format] ?? format),
                if (_count != null)
                  _oc('$_count ${_isTeamMode ? (_count == 1 ? 'team' : 'teams') : (_count == 1 ? 'player' : 'players')}'),
              ])),
              const SizedBox(width: 8),
              widget.isAdmin
                  ? ElevatedButton(
                      onPressed: _starting ? null : _start,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: _purple,
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                        minimumSize: Size.zero, tapTargetSize: MaterialTapTargetSize.shrinkWrap),
                      child: _starting
                          ? const SizedBox(width: 14, height: 14,
                              child: CircularProgressIndicator(strokeWidth: 2, valueColor: AlwaysStoppedAnimation(Colors.white)))
                          : const Text('Start', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
                    )
                  : ElevatedButton(
                      onPressed: () => widget.onJoin(t),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: _purple,
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                        minimumSize: Size.zero, tapTargetSize: MaterialTapTargetSize.shrinkWrap),
                      child: const Text('Join', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
                    ),
            ]),
          ]),
        )),
      ])),
    );
  }

  Widget _oc(String label) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
    decoration: BoxDecoration(color: _purple.withOpacity(0.1), borderRadius: BorderRadius.circular(20)),
    child: Text(label, style: const TextStyle(color: _purple, fontSize: 10, fontWeight: FontWeight.w600)),
  );
}

// ── Regular Tournament Card ───────────────────────────────────────────────────

class _TournamentCard extends StatelessWidget {
  final Map<String, dynamic> data;
  final String clanId;
  final bool isAdmin;
  final Function(dynamic) onDelete;
  const _TournamentCard({required this.data, required this.clanId,
      required this.isAdmin, required this.onDelete});

  @override
  Widget build(BuildContext context) {
    final name   = (data['tournament_name'] ?? data['name'])?.toString() ?? 'Tournament';
    final status = data['status']?.toString() ?? 'upcoming';
    final tId    = data['tournament_id'] ?? data['id'];
    final type   = data['tournament_type']?.toString() ?? 'singles';
    final format = data['format']?.toString() ?? 'knockout';
    final startDate = data['start_date']?.toString();
    const fLabels = {'knockout': 'Knockout', 'round_robin': 'Round Robin', 'group_knockout': 'Group+KO'};

    final Color color;
    final String label;
    final List<Color> grad;
    if (status == 'completed') {
      color = kColorEmerald; label = 'Completed';
      grad = [kColorEmerald, const Color(0xFF14B8A6)];
    } else if (status == 'ongoing') {
      color = kColorPrimary; label = 'Ongoing';
      grad = [kColorPrimary, const Color(0xFF14B8A6)];
    } else {
      color = kColorAmber; label = 'Upcoming';
      grad = [kColorAmber, const Color(0xFFF97316)];
    }

    return GestureDetector(
      onTap: () {
        if (tId != null) context.push('/clans/$clanId/tournament/$tId', extra: {'isAdmin': isAdmin});
      },
      child: Container(
        decoration: BoxDecoration(
          color: color.withOpacity(0.05),
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(color: color.withOpacity(0.10), blurRadius: 10, offset: const Offset(0, 3)),
            const BoxShadow(color: Color(0x04000000), blurRadius: 2),
          ],
        ),
        child: IntrinsicHeight(child: Row(children: [
          Container(
            width: 3,
            decoration: BoxDecoration(
              gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: grad),
              borderRadius: const BorderRadius.horizontal(left: Radius.circular(16)),
            ),
          ),
          Expanded(child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(child: Text(name, style: const TextStyle(
                  fontWeight: FontWeight.w800, fontSize: 15, color: kColorText))),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(20)),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    if (status == 'ongoing') Container(
                      width: 6, height: 6, margin: const EdgeInsets.only(right: 4),
                      decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
                    Text(label, style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w700)),
                  ]),
                ),
                if (isAdmin) ...[
                  const SizedBox(width: 6),
                  GestureDetector(
                    onTap: () async {
                      final ok = await showDialog<bool>(
                        context: context,
                        builder: (ctx) => AlertDialog(
                          backgroundColor: kColorSurface,
                          title: const Text('Delete Tournament?', style: TextStyle(color: kColorText)),
                          content: const Text('This will delete the tournament and all its matches.',
                              style: TextStyle(color: kColorMuted)),
                          actions: [
                            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
                            ElevatedButton(
                              onPressed: () => Navigator.pop(ctx, true),
                              style: ElevatedButton.styleFrom(backgroundColor: kColorRose),
                              child: const Text('Delete')),
                          ],
                        ),
                      );
                      if (ok == true && tId != null) onDelete(tId);
                    },
                    child: Icon(Icons.delete_outline_rounded, size: 18, color: kColorMuted.withOpacity(0.55)),
                  ),
                ],
              ]),
              Divider(height: 14, color: color.withOpacity(0.12)),
              Row(children: [
                Expanded(child: Wrap(spacing: 5, children: [
                  _tc(type == 'doubles' ? 'Doubles' : 'Singles', color),
                  _tc(fLabels[format] ?? format, color),
                ])),
                if (startDate != null)
                  Text(_fmtDate(startDate), style: const TextStyle(color: kColorMuted, fontSize: 11)),
              ]),
            ]),
          )),
        ])),
      ),
    );
  }

  Widget _tc(String label, Color color) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
    decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(20)),
    child: Text(label, style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w600)),
  );

  String _fmtDate(String raw) {
    try { final d = DateTime.parse(raw); return '${d.day}/${d.month}/${d.year}'; }
    catch (_) { return raw.length > 10 ? raw.substring(0, 10) : raw; }
  }
}

// ── Host Tournament Modal ─────────────────────────────────────────────────────

class _HostModal extends StatefulWidget {
  final String clanId;
  final VoidCallback onClose;
  final VoidCallback onCreated;
  const _HostModal({required this.clanId, required this.onClose, required this.onCreated});
  @override
  State<_HostModal> createState() => _HostModalState();
}

class _HostModalState extends State<_HostModal> {
  final _nameCtrl = TextEditingController();
  String _type    = 'singles';
  String _format  = 'knockout';
  String _regMode = 'teams';
  int    _maxP    = 8;
  int    _tpg     = 4;
  bool   _saving  = false;

  @override
  void dispose() { _nameCtrl.dispose(); super.dispose(); }

  Future<void> _submit() async {
    if (_nameCtrl.text.trim().isEmpty) return;
    setState(() => _saving = true);
    try {
      await ApiService.instance.post('/api/clans/tournaments/host_tournament', {
        'clanId': widget.clanId,
        'tournament_name': _nameCtrl.text.trim(),
        'tournament_type': _type,
        'format': _format,
        'registration_mode': _regMode,
        'max_participants': _maxP,
        'teams_per_group': _tpg,
      });
      widget.onCreated();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
      setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    const purple = Color(0xFF7C3AED);
    return GestureDetector(
      onTap: widget.onClose,
      child: Container(
        color: Colors.black54,
        child: Center(child: GestureDetector(
          onTap: () {},
          child: Container(
            margin: const EdgeInsets.all(20),
            constraints: const BoxConstraints(maxWidth: 480, maxHeight: 580),
            decoration: BoxDecoration(color: kColorSurface, borderRadius: BorderRadius.circular(20)),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Container(
                padding: const EdgeInsets.fromLTRB(20, 16, 16, 16),
                decoration: BoxDecoration(border: Border(bottom: BorderSide(color: kColorMuted.withOpacity(0.1)))),
                child: Row(children: [
                  Container(width: 32, height: 32,
                    decoration: BoxDecoration(color: purple, borderRadius: BorderRadius.circular(10)),
                    child: const Icon(Icons.bolt_rounded, color: Colors.white, size: 18)),
                  const SizedBox(width: 10),
                  const Expanded(child: Text('Host Tournament', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: kColorText))),
                  IconButton(icon: const Icon(Icons.close_rounded, color: kColorMuted), onPressed: widget.onClose,
                    padding: EdgeInsets.zero, constraints: const BoxConstraints()),
                ]),
              ),
              Flexible(child: SingleChildScrollView(
                padding: const EdgeInsets.all(20),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  _lbl('Tournament Name'),
                  TextField(controller: _nameCtrl, decoration: const InputDecoration(hintText: 'e.g. Clan Championship')),
                  const SizedBox(height: 16),
                  _lbl('Match Type'),
                  Row(children: [
                    for (final tp in [('singles', 'Singles'), ('doubles', 'Doubles')])
                      Expanded(child: Padding(
                        padding: EdgeInsets.only(right: tp.$1 == 'singles' ? 8 : 0),
                        child: _tog(tp.$2, _type == tp.$1, () => setState(() => _type = tp.$1), purple),
                      )),
                  ]),
                  const SizedBox(height: 16),
                  _lbl('Format'),
                  Row(children: [
                    for (final f in [('knockout', 'KO'), ('round_robin', 'Round Robin'), ('group_knockout', 'Group+KO')])
                      Expanded(child: Padding(
                        padding: EdgeInsets.only(right: f.$1 != 'group_knockout' ? 6 : 0),
                        child: _tog(f.$2, _format == f.$1, () => setState(() => _format = f.$1), purple),
                      )),
                  ]),
                  const SizedBox(height: 16),
                  _lbl('Registration Mode'),
                  Row(children: [
                    for (final r in [('teams', 'Teams'), ('players', 'Individual')])
                      Expanded(child: Padding(
                        padding: EdgeInsets.only(right: r.$1 == 'teams' ? 8 : 0),
                        child: _tog(r.$2, _regMode == r.$1, () => setState(() => _regMode = r.$1), purple),
                      )),
                  ]),
                  const SizedBox(height: 16),
                  _lbl('Max ${_regMode == 'teams' ? 'Teams' : 'Players'}'),
                  Wrap(spacing: 8, runSpacing: 8, children: [
                    for (final n in [4, 8, 16, 32])
                      GestureDetector(
                        onTap: () => setState(() => _maxP = n),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                          decoration: BoxDecoration(
                            color: _maxP == n ? purple : Colors.transparent,
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: _maxP == n ? purple : kColorMuted.withOpacity(0.2)),
                          ),
                          child: Text('$n', style: TextStyle(
                            color: _maxP == n ? Colors.white : kColorText, fontWeight: FontWeight.w700)),
                        ),
                      ),
                  ]),
                  if (_format == 'group_knockout') ...[
                    const SizedBox(height: 16),
                    _lbl('Teams per Group'),
                    Wrap(spacing: 8, runSpacing: 8, children: [
                      for (final n in [3, 4, 5, 6])
                        GestureDetector(
                          onTap: () => setState(() => _tpg = n),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                            decoration: BoxDecoration(
                              color: _tpg == n ? purple : Colors.transparent,
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(color: _tpg == n ? purple : kColorMuted.withOpacity(0.2)),
                            ),
                            child: Text('$n', style: TextStyle(
                              color: _tpg == n ? Colors.white : kColorText, fontWeight: FontWeight.w700)),
                          ),
                        ),
                    ]),
                  ],
                ]),
              )),
              Container(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
                decoration: BoxDecoration(border: Border(top: BorderSide(color: kColorMuted.withOpacity(0.1)))),
                child: ElevatedButton.icon(
                  onPressed: _saving ? null : _submit,
                  icon: _saving
                      ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, valueColor: AlwaysStoppedAnimation(Colors.white)))
                      : const Icon(Icons.bolt_rounded, size: 16),
                  label: Text(_saving ? 'Hosting…' : 'Host Tournament'),
                  style: ElevatedButton.styleFrom(backgroundColor: purple,
                    minimumSize: const Size(double.infinity, 44)),
                ),
              ),
            ]),
          ),
        )),
      ),
    );
  }

  Widget _lbl(String text) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Text(text.toUpperCase(), style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: kColorMuted, letterSpacing: 0.8)),
  );

  Widget _tog(String label, bool selected, VoidCallback onTap, Color c) =>
    GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: selected ? c : Colors.transparent,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: selected ? c : kColorMuted.withOpacity(0.2)),
        ),
        alignment: Alignment.center,
        child: Text(label, style: TextStyle(
          color: selected ? Colors.white : kColorText, fontSize: 13, fontWeight: FontWeight.w600)),
      ),
    );
}

// ── Join Modal ────────────────────────────────────────────────────────────────

class _JoinModal extends StatefulWidget {
  final Map<String, dynamic> tournament;
  final VoidCallback onClose;
  final VoidCallback onJoined;
  const _JoinModal({required this.tournament, required this.onClose, required this.onJoined});
  @override
  State<_JoinModal> createState() => _JoinModalState();
}

class _JoinModalState extends State<_JoinModal> {
  bool _loading   = true;
  bool _joining   = false;
  bool _alreadyIn = false;
  bool _isTeamMode = false;
  int  _maxP      = 0;
  List<Map<String, dynamic>> _regs  = [];
  List<Map<String, dynamic>> _teams = [];
  String _view = 'main';
  final _teamNameCtrl = TextEditingController();

  @override
  void initState() { super.initState(); _reload(); }
  @override
  void dispose() { _teamNameCtrl.dispose(); super.dispose(); }

  Future<void> _reload() async {
    setState(() => _loading = true);
    try {
      final id = (widget.tournament['tournament_id'] ?? widget.tournament['id'])?.toString() ?? '';
      final data = await ApiService.instance.get(
        '/api/clans/tournaments/hosted_registrations', query: {'tournamentId': id});
      if (!mounted) return;
      final currentUid = context.read<AuthProvider>().uid ?? '';
      final regs = List<Map<String, dynamic>>.from(data['registrations'] ?? []);
      setState(() {
        _regs = regs;
        _teams = List<Map<String, dynamic>>.from(data['teams'] ?? []);
        _isTeamMode = (data['tournament']?['registration_mode'] ?? '') == 'teams';
        _maxP = (data['tournament']?['max_participants'] as num?)?.toInt() ?? 0;
        _alreadyIn = regs.any((r) => r['user_id']?.toString() == currentUid);
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _join(String action, {String? teamName, dynamic hostedTeamId}) async {
    setState(() => _joining = true);
    try {
      final id = (widget.tournament['tournament_id'] ?? widget.tournament['id'])?.toString() ?? '';
      final userName = context.read<AuthProvider>().displayName;
      await ApiService.instance.post('/api/clans/tournaments/register', {
        'tournamentId': id,
        'userName': userName,
        'action': action,
        if (teamName != null) 'teamName': teamName,
        if (hostedTeamId != null) 'hostedTeamId': hostedTeamId,
      });
      widget.onJoined();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
        setState(() => _joining = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final t    = widget.tournament;
    final name = (t['tournament_name'] ?? t['name'])?.toString() ?? 'Tournament';
    final fmt  = t['format']?.toString() ?? 'knockout';
    final type = t['tournament_type']?.toString() ?? 'singles';
    const fLabels = {'knockout': 'Knockout', 'round_robin': 'Round Robin', 'group_knockout': 'Group+KO'};

    return GestureDetector(
      onTap: widget.onClose,
      child: Container(
        color: Colors.black54,
        child: Center(child: GestureDetector(
          onTap: () {},
          child: Container(
            margin: const EdgeInsets.all(20),
            constraints: const BoxConstraints(maxWidth: 480, maxHeight: 520),
            decoration: BoxDecoration(color: kColorSurface, borderRadius: BorderRadius.circular(20)),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Container(
                padding: const EdgeInsets.fromLTRB(20, 16, 16, 16),
                decoration: BoxDecoration(border: Border(bottom: BorderSide(color: kColorMuted.withOpacity(0.1)))),
                child: Row(children: [
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: kColorText)),
                    const SizedBox(height: 2),
                    Text('${fLabels[fmt] ?? fmt} · $type', style: const TextStyle(color: kColorMuted, fontSize: 12)),
                  ])),
                  IconButton(icon: const Icon(Icons.close_rounded, color: kColorMuted),
                    onPressed: widget.onClose, padding: EdgeInsets.zero, constraints: const BoxConstraints()),
                ]),
              ),
              Flexible(child: _loading
                  ? const Center(child: Padding(padding: EdgeInsets.all(32), child: CircularProgressIndicator()))
                  : _alreadyIn ? _registeredView() : _isTeamMode ? _teamView() : _playerView()),
            ]),
          ),
        )),
      ),
    );
  }

  Widget _registeredView() => Padding(
    padding: const EdgeInsets.all(32),
    child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
      Container(width: 56, height: 56,
        decoration: BoxDecoration(color: kColorEmerald.withOpacity(0.12), shape: BoxShape.circle),
        child: const Icon(Icons.check_rounded, color: kColorEmerald, size: 28)),
      const SizedBox(height: 16),
      const Text("You're registered!", style: TextStyle(fontWeight: FontWeight.w800, color: kColorEmerald, fontSize: 16)),
      const SizedBox(height: 6),
      const Text('Wait for the coach to start the tournament.',
        style: TextStyle(color: kColorMuted, fontSize: 13), textAlign: TextAlign.center),
    ]),
  );

  Widget _teamView() {
    if (_view == 'create_team') {
      return Padding(
        padding: const EdgeInsets.all(20),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
          GestureDetector(
            onTap: () => setState(() => _view = 'main'),
            child: const Text('← Back', style: TextStyle(color: Color(0xFF7C3AED), fontWeight: FontWeight.w600, fontSize: 13))),
          const SizedBox(height: 16),
          TextField(controller: _teamNameCtrl,
            decoration: const InputDecoration(labelText: 'Team Name', hintText: 'Enter your team name')),
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: _joining || _teamNameCtrl.text.trim().isEmpty
                ? null
                : () => _join('create_team', teamName: _teamNameCtrl.text.trim()),
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF7C3AED)),
            child: _joining
                ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, valueColor: AlwaysStoppedAnimation(Colors.white)))
                : const Text('Create & Join Team')),
        ]),
      );
    }
    final maxFull = _maxP > 0 && _teams.length >= _maxP;
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(color: kColorMuted.withOpacity(0.06), borderRadius: BorderRadius.circular(10)),
          child: Row(children: [
            Text('${_teams.length}${_maxP > 0 ? '/$_maxP' : ''} teams', style: const TextStyle(color: kColorMuted, fontSize: 13)),
            const Spacer(),
            Text('${_regs.length} players', style: const TextStyle(color: kColorMuted, fontSize: 12)),
          ]),
        ),
        if (_teams.isNotEmpty) ...[
          const SizedBox(height: 12),
          const Text('JOIN AN EXISTING TEAM', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: kColorMuted, letterSpacing: 0.8)),
          const SizedBox(height: 8),
          ..._teams.map((team) => Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: kColorSurface, borderRadius: BorderRadius.circular(12),
              border: Border.all(color: kColorMuted.withOpacity(0.1))),
            child: Row(children: [
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(team['team_name']?.toString() ?? 'Team', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: kColorText)),
                Text('${team['member_count'] ?? 0} member(s)', style: const TextStyle(color: kColorMuted, fontSize: 11)),
              ])),
              ElevatedButton(
                onPressed: _joining ? null : () => _join('join_team', hostedTeamId: team['hosted_team_id']),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF7C3AED),
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  minimumSize: Size.zero, tapTargetSize: MaterialTapTargetSize.shrinkWrap),
                child: const Text('Join', style: TextStyle(fontSize: 12))),
            ]),
          )),
        ],
        const SizedBox(height: 8),
        GestureDetector(
          onTap: maxFull ? null : () => setState(() => _view = 'create_team'),
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: maxFull ? kColorMuted.withOpacity(0.2) : const Color(0xFF7C3AED).withOpacity(0.4))),
            alignment: Alignment.center,
            child: Text(
              maxFull ? 'Max $_maxP teams reached' : '+ Create New Team',
              style: TextStyle(
                color: maxFull ? kColorMuted : const Color(0xFF7C3AED),
                fontWeight: FontWeight.w600, fontSize: 13)),
          ),
        ),
      ]),
    );
  }

  Widget _playerView() {
    final full = _maxP > 0 && _regs.length >= _maxP;
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(color: kColorMuted.withOpacity(0.06), borderRadius: BorderRadius.circular(10)),
          child: Text('${_regs.length}${_maxP > 0 ? '/$_maxP' : ''} players registered',
              style: const TextStyle(color: kColorMuted, fontSize: 13))),
        const SizedBox(height: 16),
        ElevatedButton(
          onPressed: _joining || full ? null : () => _join('join_player'),
          style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF7C3AED),
            minimumSize: const Size(double.infinity, 44)),
          child: _joining
              ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, valueColor: AlwaysStoppedAnimation(Colors.white)))
              : Text(full ? 'Tournament Full' : 'Join Tournament',
                  style: const TextStyle(fontWeight: FontWeight.w700))),
      ]),
    );
  }
}
