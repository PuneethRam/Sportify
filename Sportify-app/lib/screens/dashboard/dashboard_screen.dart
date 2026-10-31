import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../../core/theme.dart';
import '../../models/dashboard_model.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_service.dart';
import '../../widgets/app_card.dart';
import '../../widgets/loading_screen.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  DashboardData?      _player;
  CoachDashboardData? _coach;
  bool   _loading = true;
  bool   _coach_view = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      // Player data is required — fail fast if this is down.
      final playerJson = await ApiService.instance.get('/api/dashboard/all');
      if (!mounted) return;

      // Coach data is optional — silently skip on error.
      CoachDashboardData? coach;
      try {
        final coachJson = await ApiService.instance.get('/api/organisations/coach-dashboard');
        coach = CoachDashboardData.fromJson(coachJson);
      } catch (_) {}

      final player = DashboardData.fromJson(playerJson);
      setState(() {
        _player     = player;
        _coach      = coach;
        _coach_view = coach != null && coach.academies.isNotEmpty;
        _loading    = false;
      });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final authProvider = context.watch<AuthProvider>();
    return Scaffold(
      appBar: AppBar(
        title: Row(children: [
          Container(
            width: 28, height: 28,
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFF0369A1), kColorPrimary]),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Icon(Icons.sports_tennis_rounded,
              color: Colors.white, size: 16),
          ),
          const SizedBox(width: 10),
          const Text('Sportify'),
        ]),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_outlined, size: 20),
            onPressed: _load,
            tooltip: 'Refresh',
          ),
          IconButton(
            icon: const Icon(Icons.logout_outlined, size: 20),
            onPressed: () async {
              await authProvider.signOut();
            },
            tooltip: 'Logout',
          ),
        ],
      ),
      body: _loading
          ? const CenteredLoader()
          : _error != null
              ? ErrorView(message: _error!, onRetry: _load)
              : RefreshIndicator(
                  onRefresh: _load,
                  color: kColorPrimary,
                  child: _buildBody(),
                ),
    );
  }

  Widget _buildBody() {
    final isCoach = _coach != null && _coach!.academies.isNotEmpty;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        // View toggle
        if (isCoach) ...[
          _buildViewToggle(),
          const SizedBox(height: 12),
        ],

        if (_coach_view && isCoach)
          _CoachView(data: _coach!, userName: _player?.name ?? '')
        else if (_player != null)
          _PlayerView(data: _player!),
      ],
    );
  }

  Widget _buildViewToggle() {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: const BoxDecoration(
        color: Color(0x08000000),
        borderRadius: BorderRadius.all(Radius.circular(12)),
      ),
      child: Row(children: [
        _ToggleBtn(
          label: 'Coach View',
          selected: _coach_view,
          color: kColorEmerald,
          onTap: () => setState(() => _coach_view = true),
        ),
        _ToggleBtn(
          label: 'My Stats',
          selected: !_coach_view,
          color: kColorPrimary,
          onTap: () => setState(() => _coach_view = false),
        ),
      ]),
    );
  }
}

class _ToggleBtn extends StatelessWidget {
  final String label;
  final bool selected;
  final Color color;
  final VoidCallback onTap;
  const _ToggleBtn({required this.label, required this.selected,
    required this.color, required this.onTap});

  @override
  Widget build(BuildContext context) => Expanded(
    child: GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(vertical: 8),
        decoration: BoxDecoration(
          color: selected ? color.withOpacity(0.12) : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Text(
          label,
          textAlign: TextAlign.center,
          style: TextStyle(
            color: selected ? color : kColorMuted,
            fontWeight: FontWeight.w700,
            fontSize: 12,
          ),
        ),
      ),
    ),
  );
}

// ── Player View ──────────────────────────────────────────────────────────────

class _PlayerView extends StatefulWidget {
  final DashboardData data;
  const _PlayerView({required this.data});

  @override
  State<_PlayerView> createState() => _PlayerViewState();
}

class _PlayerViewState extends State<_PlayerView> with TickerProviderStateMixin {
  ClanStats? _clanStats;
  int _selectedClanIdx = 0;
  bool _clanLoading = false;

  late final AnimationController _animCtrl;
  late final Animation<double> _aHero;
  late final Animation<double> _aPerf;
  late final Animation<double> _aTrophy;
  late final Animation<double> _aClan;
  late final Animation<double> _aInsights;

  @override
  void initState() {
    super.initState();
    _clanStats = widget.data.activeClanStats;
    if (_clanStats != null && widget.data.clans.isNotEmpty) {
      final idx = widget.data.clans.indexWhere((c) => c.clanId == _clanStats!.clanId);
      if (idx >= 0) _selectedClanIdx = idx;
    }

    _animCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..forward();

    const c = Curves.easeOutCubic;
    _aHero     = CurvedAnimation(parent: _animCtrl, curve: const Interval(0.00, 0.55, curve: c));
    _aPerf     = CurvedAnimation(parent: _animCtrl, curve: const Interval(0.12, 0.67, curve: c));
    _aTrophy   = CurvedAnimation(parent: _animCtrl, curve: const Interval(0.24, 0.79, curve: c));
    _aClan     = CurvedAnimation(parent: _animCtrl, curve: const Interval(0.36, 0.91, curve: c));
    _aInsights = CurvedAnimation(parent: _animCtrl, curve: const Interval(0.48, 1.00, curve: c));
  }

  @override
  void dispose() {
    _animCtrl.dispose();
    super.dispose();
  }

  Future<void> _switchClan(String clanId, int idx) async {
    setState(() { _clanLoading = true; _selectedClanIdx = idx; });
    try {
      final data = await ApiService.instance.get(
        '/api/dashboard/clanStats',
        query: {'clanId': clanId},
        cached: false,
      );
      if (mounted) setState(() => _clanStats = ClanStats.fromJson(data));
    } catch (_) {}
    if (mounted) setState(() => _clanLoading = false);
  }

  @override
  Widget build(BuildContext context) => Column(
    children: [
      _AnimEntry(anim: _aHero,     child: _playerHero(widget.data)),
      const SizedBox(height: 12),
      _AnimEntry(anim: _aPerf,     child: _globalPerf(widget.data)),
      const SizedBox(height: 12),
      _AnimEntry(anim: _aTrophy,   child: _trophyCabinet(widget.data)),
      if (widget.data.clans.isNotEmpty) ...[
        const SizedBox(height: 12),
        _AnimEntry(anim: _aClan,   child: _clanPerformance()),
      ],
      if (widget.data.mostWinsAgainst.isNotEmpty || widget.data.mostLossesAgainst.isNotEmpty) ...[
        const SizedBox(height: 12),
        _AnimEntry(anim: _aInsights, child: _insights(widget.data)),
      ],
    ],
  );

  Widget _playerHero(DashboardData d) {
    final initials = d.name.split(' ')
        .where((n) => n.isNotEmpty).map((n) => n[0]).take(2).join().toUpperCase();
    final level = (d.globalPts / 100).floor().clamp(1, 99);

    return Container(
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF050C1C), Color(0xFF0A1F40), Color(0xFF0D3060)],
        ),
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(
            color: Color(0xFF0284C7).withOpacity(0.45),
            blurRadius: 32, offset: const Offset(0, 12),
            spreadRadius: -6),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(24),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 20),
          child: Column(children: [
            Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
              // Avatar with gold glow ring
              Container(
                width: 76, height: 76,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: const LinearGradient(
                    colors: [Color(0xFFFBBF24), Color(0xFFD97706)]),
                  boxShadow: [
                    BoxShadow(
                      color: const Color(0xFFFBBF24).withOpacity(0.5),
                      blurRadius: 20, spreadRadius: 2),
                  ],
                ),
                child: Padding(
                  padding: const EdgeInsets.all(3),
                  child: Container(
                    decoration: const BoxDecoration(
                      shape: BoxShape.circle,
                      color: Color(0xFF0A1F40),
                    ),
                    alignment: Alignment.center,
                    child: Text(initials, style: const TextStyle(
                      color: Colors.white, fontSize: 26, fontWeight: FontWeight.w900)),
                  ),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFBBF24).withOpacity(0.15),
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(
                        color: const Color(0xFFFBBF24).withOpacity(0.35)),
                    ),
                    child: Text('LVL $level', style: const TextStyle(
                      color: Color(0xFFFBBF24), fontSize: 10,
                      fontWeight: FontWeight.w800, letterSpacing: 1.5)),
                  ),
                  const SizedBox(height: 6),
                  Text(d.name, style: const TextStyle(
                    color: Colors.white, fontSize: 20, fontWeight: FontWeight.w900,
                    letterSpacing: -0.3)),
                  if (d.currentStreak > 1) ...[
                    const SizedBox(height: 4),
                    Row(mainAxisSize: MainAxisSize.min, children: [
                      const Icon(Icons.local_fire_department_rounded,
                        color: Color(0xFFF97316), size: 14),
                      const SizedBox(width: 3),
                      Text('${d.currentStreak} WIN STREAK',
                        style: const TextStyle(
                          color: Color(0xFFF97316), fontSize: 11,
                          fontWeight: FontWeight.w800, letterSpacing: 0.5)),
                    ]),
                  ],
                ],
              )),
            ]),
            const SizedBox(height: 22),
            // Hero: giant points number with count-up
            Column(children: [
              TweenAnimationBuilder<double>(
                tween: Tween(begin: 0, end: d.globalPts.toDouble()),
                duration: const Duration(milliseconds: 1400),
                curve: Curves.easeOutCubic,
                builder: (_, v, __) => Text(
                  NumberFormat('#,##0').format(v.round()),
                  style: const TextStyle(
                    color: Colors.white, fontSize: 52, fontWeight: FontWeight.w900,
                    letterSpacing: -2, height: 1.0)),
              ),
              const SizedBox(height: 4),
              Row(mainAxisSize: MainAxisSize.min, children: [
                const Icon(Icons.star_rounded, color: Color(0xFFFBBF24), size: 12),
                const SizedBox(width: 4),
                const Text('GLOBAL POINTS', style: TextStyle(
                  color: Colors.white38, fontSize: 10,
                  fontWeight: FontWeight.w700, letterSpacing: 1.5)),
              ]),
            ]),
            const SizedBox(height: 20),
            // HUD stats bar
            Container(
              padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 4),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.07),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: [
                  TweenAnimationBuilder<int>(
                    tween: IntTween(begin: 0, end: d.totalPlayed),
                    duration: const Duration(milliseconds: 1000),
                    curve: Curves.easeOutCubic,
                    builder: (_, v, __) => _heroStat(v.toString(), 'MATCHES'),
                  ),
                  _statDivider(),
                  TweenAnimationBuilder<int>(
                    tween: IntTween(begin: 0, end: d.winRate),
                    duration: const Duration(milliseconds: 1100),
                    curve: Curves.easeOutCubic,
                    builder: (_, v, __) => _heroStat('$v%', 'WIN RATE'),
                  ),
                  _statDivider(),
                  TweenAnimationBuilder<int>(
                    tween: IntTween(begin: 0, end: d.tournamentsWon),
                    duration: const Duration(milliseconds: 1200),
                    curve: Curves.easeOutCubic,
                    builder: (_, v, __) => _heroStat(v.toString(), 'TROPHIES'),
                  ),
                ],
              ),
            ),
          ]),
        ),
      ),
    );
  }

  Widget _heroStat(String value, String label) => Column(children: [
    Text(value, style: const TextStyle(
      color: Colors.white, fontSize: 22, fontWeight: FontWeight.w900, height: 1)),
    const SizedBox(height: 3),
    Text(label, style: const TextStyle(
      color: Colors.white38, fontSize: 9, fontWeight: FontWeight.w700,
      letterSpacing: 1.2)),
  ]);

  Widget _statDivider() => Container(
    width: 1, height: 30,
    color: Colors.white.withOpacity(0.12));

  Widget _globalPerf(DashboardData d) => AppCard(
    accentColor: kColorPrimary,
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const SectionHeading('Global Performance'),
      const SizedBox(height: 16),
      Row(children: [
        Expanded(child: _matchTypeCard(
          label: 'Singles', icon: Icons.person_outline,
          played: d.singlesPlayed, won: d.singlesWon, accent: kColorPrimary)),
        const SizedBox(width: 10),
        Expanded(child: _matchTypeCard(
          label: 'Doubles', icon: Icons.people_outline,
          played: d.doublesPlayed, won: d.doublesWon, accent: const Color(0xFFA855F7))),
      ]),
    ]),
  );

  Widget _matchTypeCard({
    required String label, required IconData icon,
    required int played, required int won, required Color accent,
  }) {
    final pct = played > 0 ? (won / played * 100).round() : 0;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: accent.withOpacity(0.08),
        borderRadius: BorderRadius.circular(14),
        boxShadow: [BoxShadow(color: accent.withOpacity(0.10), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: Column(children: [
        Text(label, style: TextStyle(
          color: accent, fontSize: 11, fontWeight: FontWeight.w700,
          letterSpacing: 1)),
        const SizedBox(height: 12),
        _DonutRing(pct: pct, accent: accent),
        const SizedBox(height: 10),
        Text('${won}W · ${played - won}L',
          style: const TextStyle(color: kColorMuted, fontSize: 12)),
      ]),
    );
  }

  Widget _trophyCabinet(DashboardData d) => AppCard(
    accentColor: kColorAmber,
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const SectionHeading('Trophy Cabinet'),
      const SizedBox(height: 16),
      Row(children: [
        Expanded(child: _trophyTile(Icons.emoji_events_rounded, d.tournamentsWon.toString(), 'Champion',
          const Color(0xFFF59E0B))),
        Expanded(child: _trophyTile(Icons.workspace_premium_rounded, d.runnerUp.toString(), 'Runner-Up',
          kColorMuted)),
        Expanded(child: _trophyTile(Icons.sports_tennis_rounded, d.tournamentsPlayed.toString(), 'Entered',
          kColorPrimary)),
      ]),
      const SizedBox(height: 12),
      Row(children: [
        Expanded(child: _streakTile(Icons.local_fire_department_rounded,
          d.currentStreak, 'Current', const Color(0xFFF97316))),
        const SizedBox(width: 10),
        Expanded(child: _streakTile(Icons.military_tech_rounded,
          d.bestStreak, 'Best Ever', kColorPrimary)),
      ]),
    ]),
  );

  Widget _trophyTile(IconData icon, String count, String label, Color color) =>
    Column(children: [
      Container(
        width: 42, height: 42,
        decoration: BoxDecoration(
          color: color.withOpacity(0.10),
          shape: BoxShape.circle,
        ),
        child: Icon(icon, color: count != '0' ? color : kColorMuted, size: 22),
      ),
      const SizedBox(height: 6),
      Text(count, style: TextStyle(
        color: count != '0' ? color : kColorMuted,
        fontSize: 22, fontWeight: FontWeight.w900)),
      Text(label, style: const TextStyle(color: kColorMuted, fontSize: 11)),
    ]);

  Widget _streakTile(IconData icon, int count, String label, Color color) =>
    Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withOpacity(0.06),
        borderRadius: BorderRadius.circular(12),
        boxShadow: [BoxShadow(color: color.withOpacity(0.18), blurRadius: 12, spreadRadius: -2, offset: const Offset(0, 3))],
      ),
      child: Row(children: [
        Icon(icon, color: color, size: 22),
        const SizedBox(width: 10),
        Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: const TextStyle(color: kColorMuted, fontSize: 11)),
          Text('$count W', style: TextStyle(
            color: color, fontSize: 20, fontWeight: FontWeight.w900)),
        ]),
      ]),
    );

  Widget _insights(DashboardData d) => AppCard(
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const SectionHeading('Player Insights'),
      const SizedBox(height: 16),
      if (d.mostWinsAgainst.isNotEmpty) ...[
        _insightSection('You Dominate', d.mostWinsAgainst,
          kColorEmerald, Icons.trending_up_rounded, true),
        if (d.mostLossesAgainst.isNotEmpty)
          const SizedBox(height: 20),
      ],
      if (d.mostLossesAgainst.isNotEmpty)
        _insightSection('Your Nemesis', d.mostLossesAgainst,
          kColorRose, Icons.trending_down_rounded, false),
    ]),
  );

  Widget _insightSection(String title, List<PlayerStat> players,
    Color color, IconData icon, bool wins) {
    final counts = players.map((p) => wins ? p.wins : p.losses).toList();
    final maxCount = counts.isEmpty ? 1 : counts.reduce((a, b) => a > b ? a : b);
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
          decoration: BoxDecoration(
            color: color.withOpacity(0.12),
            borderRadius: BorderRadius.circular(7),
          ),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(icon, color: color, size: 13),
            const SizedBox(width: 5),
            Text(title.toUpperCase(), style: TextStyle(
              color: color, fontSize: 10, fontWeight: FontWeight.w800,
              letterSpacing: 0.7)),
          ]),
        ),
      ]),
      const SizedBox(height: 14),
      ...players.take(3).toList().asMap().entries.map((entry) {
        final rank = entry.key + 1;
        final p = entry.value;
        final count = wins ? p.wins : p.losses;
        final fill = maxCount > 0 ? count / maxCount : 0.0;
        final initial = p.name.isNotEmpty ? p.name[0].toUpperCase() : '?';
        final isTop = rank == 1;
        return Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
            SizedBox(
              width: 22,
              child: Text('#$rank', style: TextStyle(
                color: isTop ? color : kColorMuted,
                fontSize: 11, fontWeight: FontWeight.w800)),
            ),
            Container(
              width: 34, height: 34,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: color.withOpacity(isTop ? 0.18 : 0.09),
                border: isTop
                  ? Border.all(color: color.withOpacity(0.4), width: 1.5)
                  : null,
              ),
              alignment: Alignment.center,
              child: Text(initial, style: TextStyle(
                color: color, fontSize: 14, fontWeight: FontWeight.w800)),
            ),
            const SizedBox(width: 10),
            Expanded(child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(p.name,
                  style: TextStyle(
                    color: kColorText, fontSize: 12,
                    fontWeight: isTop ? FontWeight.w700 : FontWeight.w500),
                  overflow: TextOverflow.ellipsis),
                const SizedBox(height: 5),
                TweenAnimationBuilder<double>(
                  tween: Tween(begin: 0, end: fill),
                  duration: const Duration(milliseconds: 900),
                  curve: Curves.easeOutCubic,
                  builder: (_, v, __) => ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(
                      value: v,
                      minHeight: 5,
                      backgroundColor: color.withOpacity(0.10),
                      valueColor: AlwaysStoppedAnimation(
                        color.withOpacity(isTop ? 0.85 : 0.50)),
                    ),
                  ),
                ),
              ],
            )),
            const SizedBox(width: 10),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
              decoration: BoxDecoration(
                color: color.withOpacity(isTop ? 0.15 : 0.08),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(wins ? '${count}W' : '${count}L',
                style: TextStyle(
                  color: color, fontSize: 12, fontWeight: FontWeight.w900)),
            ),
          ]),
        );
      }),
    ]);
  }

  // ── Clan Performance ──────────────────────────────────────────────────────
  Widget _clanPerformance() {
    const accent = Color(0xFF7C3AED);
    final clans = widget.data.clans;
    final cs = _clanStats;

    return AppCard(
      accentColor: accent,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
            width: 28, height: 28,
            decoration: BoxDecoration(
              color: accent.withOpacity(0.15),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Icon(Icons.shield_rounded, color: accent, size: 16),
          ),
          const SizedBox(width: 8),
          const Expanded(child: SectionHeading('Clan Performance')),
          if (_clanLoading)
            const SizedBox(width: 14, height: 14,
              child: CircularProgressIndicator(strokeWidth: 2, color: accent)),
        ]),

        // Clan selector dropdown (multi-clan)
        if (clans.length > 1) ...[
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
            decoration: BoxDecoration(
              color: accent.withOpacity(0.07),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: accent.withOpacity(0.25)),
            ),
            child: DropdownButtonHideUnderline(
              child: DropdownButton<int>(
                value: _selectedClanIdx,
                isExpanded: true,
                icon: const Icon(Icons.keyboard_arrow_down_rounded,
                  color: accent, size: 20),
                style: const TextStyle(
                  color: accent, fontSize: 13, fontWeight: FontWeight.w700),
                dropdownColor: kColorSurface,
                borderRadius: BorderRadius.circular(12),
                onChanged: (i) {
                  if (i != null && i != _selectedClanIdx) {
                    _switchClan(clans[i].clanId, i);
                  }
                },
                items: List.generate(clans.length, (i) => DropdownMenuItem(
                  value: i,
                  child: Text(clans[i].name,
                    style: const TextStyle(
                      color: accent, fontWeight: FontWeight.w700)),
                )),
              ),
            ),
          ),
        ],

        const SizedBox(height: 16),

        if (cs == null) ...[
          const Center(child: Padding(
            padding: EdgeInsets.symmetric(vertical: 8),
            child: Text('No clan performance data',
              style: TextStyle(color: kColorMuted, fontSize: 13)),
          )),
        ] else ...[
          // Clan points
          Center(child: Column(children: [
            Text(NumberFormat('#,##0').format(cs.clanPoints),
              style: const TextStyle(color: accent, fontSize: 36,
                fontWeight: FontWeight.w900, letterSpacing: -1)),
            const Row(mainAxisSize: MainAxisSize.min, children: [
              Icon(Icons.shield_rounded, color: accent, size: 11),
              SizedBox(width: 4),
              Text('CLAN POINTS', style: TextStyle(
                color: kColorMuted, fontSize: 10,
                fontWeight: FontWeight.w700, letterSpacing: 1.5)),
            ]),
          ])),
          const SizedBox(height: 16),

          // Match type cards
          Row(children: [
            Expanded(child: _clanMatchCard(
              label: 'Singles', icon: Icons.person_outline,
              played: cs.singlesPlayed, won: cs.singlesWon,
              cardAccent: kColorPrimary)),
            const SizedBox(width: 10),
            Expanded(child: _clanMatchCard(
              label: 'Doubles', icon: Icons.people_outline,
              played: cs.doublesPlayed, won: cs.doublesWon,
              cardAccent: const Color(0xFFA855F7))),
          ]),

          const SizedBox(height: 12),

          // Tournament row
          Row(children: [
            Expanded(child: _trophyTile(Icons.emoji_events_rounded,
              cs.tournamentsWon.toString(), 'Won', const Color(0xFFF59E0B))),
            Expanded(child: _trophyTile(Icons.workspace_premium_rounded,
              cs.runnerUp.toString(), 'Runner-Up', kColorMuted)),
            Expanded(child: _trophyTile(Icons.sports_tennis_rounded,
              cs.tournamentsPlayed.toString(), 'Entered', kColorPrimary)),
          ]),

          // Series card (if any series matches)
          if (cs.seriesSinglesPlayed + cs.seriesDoublesPlayed > 0) ...[
            const SizedBox(height: 12),
            _seriesCard(cs),
          ],
        ],
      ]),
    );
  }

  Widget _clanMatchCard({
    required String label,
    required IconData icon,
    required int played,
    required int won,
    required Color cardAccent,
  }) {
    final pct = played > 0 ? (won / played * 100).round() : 0;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: cardAccent.withOpacity(0.08),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(children: [
        Text(label, style: TextStyle(
          color: cardAccent, fontSize: 11, fontWeight: FontWeight.w700,
          letterSpacing: 1)),
        const SizedBox(height: 12),
        _DonutRing(pct: pct, accent: cardAccent),
        const SizedBox(height: 10),
        Text('${won}W · ${played - won}L',
          style: const TextStyle(color: kColorMuted, fontSize: 12)),
      ]),
    );
  }

  Widget _seriesCard(ClanStats cs) {
    final seriesPlayed = cs.seriesSinglesPlayed + cs.seriesDoublesPlayed;
    final seriesWon = cs.seriesSinglesWon + cs.seriesDoublesWon;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF7C3AED).withOpacity(0.06),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(children: [
        const Icon(Icons.repeat_rounded, color: Color(0xFF7C3AED), size: 18),
        const SizedBox(width: 10),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Series Matches', style: TextStyle(
            fontSize: 12, fontWeight: FontWeight.w700, color: kColorText)),
          Text('${seriesWon}W · ${seriesPlayed - seriesWon}L of $seriesPlayed played',
            style: const TextStyle(fontSize: 11, color: kColorMuted)),
        ])),
      ]),
    );
  }
}

// ── Coach View ───────────────────────────────────────────────────────────────

class _CoachView extends StatelessWidget {
  final CoachDashboardData data;
  final String userName;
  const _CoachView({required this.data, required this.userName});

  @override
  Widget build(BuildContext context) {
    final academy = data.academies.first;
    final initials = userName.split(' ')
        .where((n) => n.isNotEmpty).map((n) => n[0]).take(2).join().toUpperCase();

    return Column(children: [
      _coachHero(academy, initials),
      const SizedBox(height: 12),
      _batchesCard(context, academy),
      if (data.atRiskStudents.isNotEmpty) ...[
        const SizedBox(height: 12),
        _atRiskCard(data.atRiskStudents),
      ],
      if (academy.upcomingSessions.isNotEmpty) ...[
        const SizedBox(height: 12),
        _sessionsCard(academy.upcomingSessions),
      ],
    ]);
  }

  Widget _coachHero(AcademyData academy, String initials) =>
    Container(
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft, end: Alignment.bottomRight,
          colors: [Color(0xFF0A1628), Color(0xFF0C3B22), Color(0xFF059669)],
        ),
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF059669).withOpacity(0.3),
            blurRadius: 20, offset: const Offset(0, 8)),
        ],
      ),
      child: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 0),
          child: Row(children: [
            Container(
              width: 72, height: 72,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: LinearGradient(
                  colors: [kColorEmerald, kColorEmerald.withOpacity(0.6)]),
                boxShadow: [
                  BoxShadow(
                    color: kColorEmerald.withOpacity(0.45),
                    blurRadius: 18, spreadRadius: 2),
                ],
              ),
              child: Padding(
                padding: const EdgeInsets.all(3),
                child: Container(
                  decoration: const BoxDecoration(
                    shape: BoxShape.circle,
                    color: Color(0xFF0C3B22),
                  ),
                  alignment: Alignment.center,
                  child: Text(initials, style: const TextStyle(
                    color: Colors.white, fontSize: 26, fontWeight: FontWeight.w900)),
                ),
              ),
            ),
            const SizedBox(width: 16),
            Expanded(child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: kColorEmerald.withOpacity(0.18),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text('COACH', style: TextStyle(
                    color: kColorEmerald, fontSize: 10, fontWeight: FontWeight.w800,
                    letterSpacing: 1.5)),
                ),
                const SizedBox(height: 4),
                Text(userName, style: const TextStyle(
                  color: Colors.white, fontSize: 20, fontWeight: FontWeight.w900)),
                Text(academy.name, style: TextStyle(
                  color: kColorEmerald.withOpacity(0.8), fontSize: 12)),
              ],
            )),
          ]),
        ),
        const SizedBox(height: 20),
        Container(
          decoration: BoxDecoration(
            border: Border(top: BorderSide(color: Colors.white.withOpacity(0.1))),
          ),
          padding: const EdgeInsets.symmetric(vertical: 16),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              StatTile(label: 'Students',  value: academy.totalStudents.toString()),
              StatTile(label: 'Batches',   value: academy.batches.length.toString()),
              StatTile(label: 'Avg Att.',  value: '${academy.avgAttendance.round()}%'),
            ],
          ),
        ),
      ]),
    );

  Widget _batchesCard(BuildContext context, AcademyData academy) => AppCard(
    accentColor: kColorEmerald,
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const SectionHeading('Batches'),
      const SizedBox(height: 12),
      if (academy.batches.isEmpty)
        const EmptyView(message: 'No batches yet', icon: Icons.groups_outlined)
      else
        ...academy.batches.map((b) => _BatchTile(batch: b)),
    ]),
  );

  Widget _atRiskCard(List<AtRiskEntry> students) => AppCard(
    accentColor: kColorRose,
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        const Icon(Icons.warning_amber_rounded, color: Color(0xFFEF4444), size: 16),
        const SizedBox(width: 6),
        const Expanded(child: SectionHeading('Needs Attention')),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
          decoration: BoxDecoration(
            color: kColorRose.withOpacity(0.12),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Text('< 60% attendance',
            style: TextStyle(color: kColorRose, fontSize: 10, fontWeight: FontWeight.w700)),
        ),
      ]),
      const SizedBox(height: 12),
      ...students.take(5).map((s) => Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: kColorRose.withOpacity(0.05),
          borderRadius: BorderRadius.circular(12),
          boxShadow: [BoxShadow(color: kColorRose.withOpacity(0.10), blurRadius: 6, offset: const Offset(0, 2))],
        ),
        child: Row(children: [
          CircleAvatar(
            radius: 18, backgroundColor: kColorRose.withOpacity(0.7),
            child: Text(s.name[0], style: const TextStyle(
              color: Colors.white, fontWeight: FontWeight.w700)),
          ),
          const SizedBox(width: 12),
          Expanded(child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(s.name, style: const TextStyle(
                fontSize: 13, fontWeight: FontWeight.w600, color: kColorText)),
              Text(s.batchName, style: const TextStyle(
                fontSize: 11, color: kColorMuted)),
            ],
          )),
          Text('${s.rate.round()}%', style: const TextStyle(
            color: Color(0xFFEF4444), fontSize: 15, fontWeight: FontWeight.w900)),
        ]),
      )),
    ]),
  );

  Widget _sessionsCard(List<UpcomingSession> sessions) => AppCard(
    accentColor: kColorPrimary,
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Row(children: [
        Icon(Icons.calendar_today_outlined, size: 16, color: kColorPrimary),
        SizedBox(width: 6),
        SectionHeading('Upcoming Sessions'),
      ]),
      const SizedBox(height: 12),
      ...sessions.map((s) {
        final now = DateTime.now();
        final diff = s.scheduledAt.difference(now);
        String when;
        if (diff.inHours < 24 && s.scheduledAt.day == now.day) {
          when = 'Today · ${DateFormat.jm().format(s.scheduledAt)}';
        } else if (diff.inHours < 48) {
          when = 'Tomorrow · ${DateFormat.jm().format(s.scheduledAt)}';
        } else {
          when = DateFormat('EEE, MMM d · h:mm a').format(s.scheduledAt);
        }
        return Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: kColorPrimary.withOpacity(0.05),
            borderRadius: BorderRadius.circular(12),
            boxShadow: [BoxShadow(color: kColorPrimary.withOpacity(0.08), blurRadius: 6, offset: const Offset(0, 2))],
          ),
          child: Row(children: [
            Container(
              width: 36, height: 36,
              decoration: BoxDecoration(
                color: kColorPrimary.withOpacity(0.15),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(Icons.calendar_today_rounded,
                color: kColorPrimary, size: 18),
            ),
            const SizedBox(width: 12),
            Expanded(child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(s.title, style: const TextStyle(
                  fontSize: 13, fontWeight: FontWeight.w600, color: kColorText)),
                Text('$when · ${s.durationMinutes}m',
                  style: const TextStyle(fontSize: 11, color: kColorMuted)),
              ],
            )),
          ]),
        );
      }),
    ]),
  );
}

class _BatchTile extends StatelessWidget {
  final BatchData batch;
  const _BatchTile({required this.batch});

  @override
  Widget build(BuildContext context) {
    Color barColor;
    if (batch.attendanceRate >= 75) barColor = kColorEmerald;
    else if (batch.attendanceRate >= 50) barColor = kColorAmber;
    else barColor = kColorRose;

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: const BoxDecoration(
        color: kColorSurface,
        borderRadius: BorderRadius.all(Radius.circular(14)),
        boxShadow: [
          BoxShadow(color: Color(0x0A000000), blurRadius: 8, offset: Offset(0, 2)),
          BoxShadow(color: Color(0x04000000), blurRadius: 2),
        ],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(batch.name, style: const TextStyle(
                fontWeight: FontWeight.w700, fontSize: 14, color: kColorText)),
              Text('${batch.memberCount} students · ${batch.totalSessions} sessions',
                style: const TextStyle(fontSize: 11, color: kColorMuted)),
            ],
          )),
          if (batch.atRiskCount > 0)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: kColorRose.withOpacity(0.12),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text('${batch.atRiskCount} at risk',
                style: const TextStyle(color: Color(0xFFEF4444),
                  fontSize: 11, fontWeight: FontWeight.w700)),
            ),
        ]),
        const SizedBox(height: 10),
        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text(batch.healthLabel.toUpperCase(),
            style: TextStyle(color: barColor, fontSize: 10, fontWeight: FontWeight.w700,
              letterSpacing: 0.8)),
          Text('${batch.attendanceRate.round()}%',
            style: TextStyle(color: barColor, fontSize: 13, fontWeight: FontWeight.w900)),
        ]),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: LinearProgressIndicator(
            value: batch.attendanceRate / 100,
            minHeight: 6,
            backgroundColor: Colors.black.withOpacity(0.08),
            valueColor: AlwaysStoppedAnimation(barColor),
          ),
        ),
      ]),
    );
  }
}

// ── Donut Ring ────────────────────────────────────────────────────────────────

class _DonutRing extends StatelessWidget {
  final int pct;
  final Color accent;
  const _DonutRing({required this.pct, required this.accent});

  @override
  Widget build(BuildContext context) => TweenAnimationBuilder<double>(
    tween: Tween(begin: 0, end: pct / 100),
    duration: const Duration(milliseconds: 1200),
    curve: Curves.easeOutCubic,
    builder: (_, value, __) => SizedBox(
      width: 88, height: 88,
      child: Stack(alignment: Alignment.center, children: [
        Positioned.fill(child: CircularProgressIndicator(
          value: value,
          backgroundColor: Colors.black.withOpacity(0.08),
          valueColor: AlwaysStoppedAnimation(accent),
          strokeWidth: 9,
          strokeCap: StrokeCap.round,
        )),
        Text('${(value * 100).round()}%', style: TextStyle(
          color: accent, fontSize: 17, fontWeight: FontWeight.w900)),
      ]),
    ),
  );
}

// ── Animation helpers ─────────────────────────────────────────────────────────

class _AnimEntry extends StatelessWidget {
  final Widget child;
  final Animation<double> anim;
  const _AnimEntry({required this.child, required this.anim});

  @override
  Widget build(BuildContext context) => FadeTransition(
    opacity: anim,
    child: SlideTransition(
      position: Tween<Offset>(
        begin: const Offset(0, 0.15),
        end: Offset.zero,
      ).animate(anim),
      child: child,
    ),
  );
}
