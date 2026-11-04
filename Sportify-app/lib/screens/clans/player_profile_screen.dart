import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../core/theme.dart';
import '../../models/progress_model.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_service.dart';
import '../../widgets/loading_screen.dart';
import '../../widgets/rating_widgets.dart';
import '../../widgets/share_card.dart';

// ── Data model ───────────────────────────────────────────────────────────────

class _Profile {
  final String name;
  final String email;
  final List<Map<String, dynamic>> clans;
  final int singlesPlayed;
  final int singlesWon;
  final int doublesPlayed;
  final int doublesWon;
  final int currentStreak;
  final int bestStreak;
  final List<Map<String, dynamic>> mostWinsAgainst;
  final List<Map<String, dynamic>> mostLossesAgainst;
  final List<Map<String, dynamic>> recentMatches;

  _Profile({
    required this.name,
    required this.email,
    required this.clans,
    required this.singlesPlayed,
    required this.singlesWon,
    required this.doublesPlayed,
    required this.doublesWon,
    required this.currentStreak,
    required this.bestStreak,
    required this.mostWinsAgainst,
    required this.mostLossesAgainst,
    required this.recentMatches,
  });

  factory _Profile.fromJson(Map<String, dynamic> j) {
    final s = (j['stats'] as Map<String, dynamic>?) ?? {};
    return _Profile(
      name: j['name']?.toString() ?? '',
      email: j['email']?.toString() ?? '',
      clans: List<Map<String, dynamic>>.from(j['clans'] ?? []),
      singlesPlayed: _int(s['singles_played']),
      singlesWon: _int(s['singles_won']),
      doublesPlayed: _int(s['doubles_played']),
      doublesWon: _int(s['doubles_won']),
      currentStreak: _int(j['currentStreak']),
      bestStreak: _int(j['bestStreak']),
      mostWinsAgainst:
          List<Map<String, dynamic>>.from(j['mostWinsAgainst'] ?? []),
      mostLossesAgainst:
          List<Map<String, dynamic>>.from(j['mostLossesAgainst'] ?? []),
      recentMatches:
          List<Map<String, dynamic>>.from(j['recentMatches'] ?? []),
    );
  }
}

int _int(dynamic v) {
  if (v == null) return 0;
  if (v is int) return v;
  if (v is double) return v.toInt();
  return int.tryParse(v.toString()) ?? 0;
}

String _parseScore(dynamic raw) {
  if (raw == null) return '–';
  if (raw is Map) return raw['score']?.toString() ?? '–';
  if (raw is String) return raw;
  return '–';
}

String _relativeDate(String dateStr) {
  final d = DateTime.tryParse(dateStr);
  if (d == null) return dateStr;
  final days = DateTime.now().difference(d).inDays;
  if (days == 0) return 'Today';
  if (days == 1) return 'Yesterday';
  if (days < 7) return '${days}d ago';
  if (days < 30) return '${days ~/ 7}w ago';
  return '${d.month}/${d.day}';
}

// ── Screen ───────────────────────────────────────────────────────────────────

class PlayerProfileScreen extends StatefulWidget {
  final String userId;
  final String clanId;

  const PlayerProfileScreen({
    super.key,
    required this.userId,
    required this.clanId,
  });

  @override
  State<PlayerProfileScreen> createState() => _PlayerProfileScreenState();
}

class _PlayerProfileScreenState extends State<PlayerProfileScreen> {
  _Profile? _profile;
  PlayerProgress? _progress;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  /// Ratings, weekly streak, badges and clan ranks. Optional: the profile
  /// still shows if this fails (e.g. an older backend).
  Future<void> _loadProgress() async {
    try {
      final data = await ApiService.instance.getProgress(userId: widget.userId);
      if (mounted) setState(() => _progress = PlayerProgress.fromJson(data));
    } catch (_) {}
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    _loadProgress();
    try {
      final data = await ApiService.instance.get(
        '/api/dashboard/userProfile',
        query: {'userId': widget.userId},
        cached: false,
      );
      if (!mounted) return;
      setState(() {
        _profile = _Profile.fromJson(data);
        _loading = false;
      });
    } catch (e) {
      if (mounted) setState(() { _error = e.toString(); _loading = false; });
    }
  }

  String _shareMessage() {
    final p = _progress;
    if (p == null) return 'My Sportify profile.';
    final r = p.ratings.of(p.format);
    final parts = <String>[
      if (!r.provisional) '${p.format == 'doubles' ? 'Doubles' : 'Singles'} rating ${r.rating}',
      if (p.streak.current > 1) '${p.streak.current}-week streak',
    ];
    return parts.isEmpty ? 'My Sportify profile.' : 'My Sportify profile: ${parts.join(', ')}.';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kColorBg,
      appBar: AppBar(
        backgroundColor: kColorSurface,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
          onPressed: () => context.pop(),
        ),
        title: Text(
          _profile?.name ?? 'Player',
          style: const TextStyle(
            color: kColorText, fontWeight: FontWeight.w800, fontSize: 18),
        ),
        actions: [
          // Players can only share their own profile card
          if (context.watch<AuthProvider>().uid == widget.userId && _profile != null)
            ShareCardButton(
              kind: 'profile',
              clanId: int.tryParse(widget.clanId),
              message: _shareMessage(),
              color: kColorText,
              size: 20,
            ),
        ],
      ),
      body: _loading
          ? const CenteredLoader()
          : _error != null
              ? ErrorView(message: _error!, onRetry: _load)
              : _profile == null
                  ? const ErrorView(message: 'Profile not found')
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: _Body(
                          profile: _profile!, progress: _progress, clanId: widget.clanId),
                    ),
    );
  }
}

// ── Body ─────────────────────────────────────────────────────────────────────

class _Body extends StatelessWidget {
  final _Profile profile;
  final PlayerProgress? progress;
  final String clanId;
  const _Body({required this.profile, required this.progress, required this.clanId});

  @override
  Widget build(BuildContext context) {
    final totalPlayed = profile.singlesPlayed + profile.doublesPlayed;
    final totalWon    = profile.singlesWon    + profile.doublesWon;
    final totalLost   = totalPlayed - totalWon;
    final overallPct  = totalPlayed > 0
        ? (totalWon / totalPlayed * 100).round() : 0;

    final clanName = profile.clans
        .firstWhere(
          (c) => c['clan_id']?.toString() == clanId,
          orElse: () => profile.clans.isNotEmpty ? profile.clans.first : {},
        )['name']
        ?.toString();

    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        _HeroBanner(
          profile: profile,
          clanName: clanName,
          totalPlayed: totalPlayed,
          overallPct: overallPct,
          weeklyStreak: progress?.streak.current,
        ),
        const SizedBox(height: 10),
        if (progress != null) ...[
          _RatingsCard(progress: progress!),
          const SizedBox(height: 10),
          _WeeklyStreakCard(streak: progress!.streak),
          const SizedBox(height: 10),
          if (progress!.clans.isNotEmpty) ...[
            _ClanRanksCard(progress: progress!),
            const SizedBox(height: 10),
          ],
          if (progress!.badges.isNotEmpty) ...[
            _BadgesCard(badges: progress!.badges),
            const SizedBox(height: 10),
          ],
        ],
        if (totalPlayed > 0) ...[
          _WLBar(totalWon: totalWon, totalLost: totalLost),
          const SizedBox(height: 10),
        ],
        Row(children: [
          Expanded(child: _StatCard(
            label: 'Singles',
            icon: Icons.person_outline,
            accent: const Color(0xFF0EA5E9),
            iconBg: const Color(0x1A0EA5E9),
            played: profile.singlesPlayed,
            won: profile.singlesWon,
          )),
          const SizedBox(width: 10),
          Expanded(child: _StatCard(
            label: 'Doubles',
            icon: Icons.people_outline,
            accent: const Color(0xFFA855F7),
            iconBg: const Color(0x1AA855F7),
            played: profile.doublesPlayed,
            won: profile.doublesWon,
          )),
        ]),
        // Win streak (from match history) only when weekly streaks aren't available
        if (progress == null && profile.bestStreak > 1) ...[
          const SizedBox(height: 10),
          _StreakCard(current: profile.currentStreak, best: profile.bestStreak),
        ],
        if (profile.mostWinsAgainst.isNotEmpty ||
            profile.mostLossesAgainst.isNotEmpty) ...[
          const SizedBox(height: 10),
          _RivalsCard(
            wins: profile.mostWinsAgainst,
            losses: profile.mostLossesAgainst,
          ),
        ],
        if (profile.recentMatches.isNotEmpty) ...[
          const SizedBox(height: 10),
          _RecentMatchesCard(matches: profile.recentMatches),
        ],
        if (totalPlayed == 0) ...[
          const SizedBox(height: 24),
          const EmptyView(
            message: 'No matches yet\nStats will appear after the first match',
            icon: Icons.trending_up_outlined,
          ),
        ],
        const SizedBox(height: 24),
      ],
    );
  }
}

// ── Hero banner ──────────────────────────────────────────────────────────────

class _HeroBanner extends StatelessWidget {
  final _Profile profile;
  final String? clanName;
  final int totalPlayed;
  final int overallPct;
  final int? weeklyStreak;

  const _HeroBanner({
    required this.profile,
    this.clanName,
    required this.totalPlayed,
    required this.overallPct,
    this.weeklyStreak,
  });

  @override
  Widget build(BuildContext context) {
    final initials = profile.name.trim().split(' ')
        .where((p) => p.isNotEmpty).map((p) => p[0].toUpperCase()).take(2).join();

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
            color: const Color(0xFF0284C7).withOpacity(0.35),
            blurRadius: 28, offset: const Offset(0, 10), spreadRadius: -6),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(24),
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
              // Circular avatar with glow ring
              Container(
                width: 72, height: 72,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: const LinearGradient(
                    colors: [Color(0xFF38BDF8), Color(0xFF0284C7)]),
                  boxShadow: [
                    BoxShadow(
                      color: const Color(0xFF38BDF8).withOpacity(0.45),
                      blurRadius: 18, spreadRadius: 2),
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
                    child: Text(initials.isEmpty ? '?' : initials,
                      style: const TextStyle(
                        color: Colors.white, fontWeight: FontWeight.w900, fontSize: 26)),
                  ),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(profile.name,
                    style: const TextStyle(
                      color: Colors.white, fontWeight: FontWeight.w900,
                      fontSize: 20, letterSpacing: -0.3),
                    maxLines: 1, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 4),
                  Text(profile.email,
                    style: const TextStyle(
                      color: Color(0x807DD3FC), fontSize: 11),
                    maxLines: 1, overflow: TextOverflow.ellipsis),
                  if (clanName != null) ...[
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.10),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                        const Icon(Icons.shield_rounded,
                          color: Colors.white60, size: 11),
                        const SizedBox(width: 4),
                        Text(clanName!,
                          style: const TextStyle(
                            color: Colors.white, fontSize: 11,
                            fontWeight: FontWeight.w600)),
                      ]),
                    ),
                  ],
                  if (profile.currentStreak > 1) ...[
                    const SizedBox(height: 6),
                    Row(mainAxisSize: MainAxisSize.min, children: [
                      const Icon(Icons.local_fire_department_rounded,
                        color: Color(0xFFF97316), size: 13),
                      const SizedBox(width: 3),
                      Text('${profile.currentStreak} WIN STREAK',
                        style: const TextStyle(
                          color: Color(0xFFF97316), fontSize: 10,
                          fontWeight: FontWeight.w800, letterSpacing: 0.5)),
                    ]),
                  ],
                ],
              )),
            ]),
            const SizedBox(height: 20),
            Container(height: 1, color: Colors.white.withOpacity(0.1)),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 4),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.06),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(children: [
                Expanded(child: _StatCell(
                  label: 'MATCHES', value: totalPlayed.toString())),
                Container(width: 1, height: 36,
                  color: Colors.white.withOpacity(0.12)),
                Expanded(child: _StatCell(
                  label: 'WIN RATE', value: '$overallPct%')),
                Container(width: 1, height: 36,
                  color: Colors.white.withOpacity(0.12)),
                Expanded(child: weeklyStreak != null
                    ? _StatCell(label: 'WEEK STREAK', value: '$weeklyStreak')
                    : _StatCell(
                        label: 'STREAK',
                        value: profile.currentStreak > 0
                            ? '${profile.currentStreak}x'
                            : profile.currentStreak.toString(),
                      )),
              ]),
            ),
          ]),
        ),
      ),
    );
  }
}

class _StatCell extends StatelessWidget {
  final String label;
  final String value;
  const _StatCell({required this.label, required this.value});

  @override
  Widget build(BuildContext context) => Column(children: [
    Text(value,
      style: const TextStyle(
        color: Colors.white, fontWeight: FontWeight.w900, fontSize: 22)),
    const SizedBox(height: 3),
    Text(label,
      style: const TextStyle(
        color: Color(0x80FFFFFF), fontSize: 10,
        fontWeight: FontWeight.w600, letterSpacing: 0.8)),
  ]);
}

// ── W/L bar ──────────────────────────────────────────────────────────────────

class _WLBar extends StatelessWidget {
  final int totalWon;
  final int totalLost;
  const _WLBar({required this.totalWon, required this.totalLost});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: kColorSurface,
        borderRadius: BorderRadius.all(Radius.circular(16)),
        boxShadow: [
          BoxShadow(color: Color(0x0A000000), blurRadius: 8, offset: Offset(0, 2)),
          BoxShadow(color: Color(0x04000000), blurRadius: 2),
        ],
      ),
      clipBehavior: Clip.hardEdge,
      child: Column(children: [
        Row(children: [
          if (totalWon > 0)
            Flexible(
              flex: totalWon,
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                color: const Color(0x1422C55E),
                child: Text('${totalWon}W',
                  style: const TextStyle(
                    color: kColorEmerald, fontWeight: FontWeight.w900,
                    fontSize: 14)),
              ),
            ),
          if (totalLost > 0)
            Flexible(
              flex: totalLost,
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                color: const Color(0x0FF43F5E),
                alignment: Alignment.centerRight,
                child: Text('${totalLost}L',
                  style: const TextStyle(
                    color: kColorRose, fontWeight: FontWeight.w900,
                    fontSize: 14)),
              ),
            ),
        ]),
        SizedBox(
          height: 5,
          child: Row(children: [
            if (totalWon > 0)
              Flexible(
                flex: totalWon,
                child: Container(color: kColorEmerald),
              ),
            if (totalLost > 0)
              Flexible(
                flex: totalLost,
                child: Container(color: kColorRose.withOpacity(0.7)),
              ),
          ]),
        ),
      ]),
    );
  }
}

// ── Stat card (Singles / Doubles) ────────────────────────────────────────────

class _StatCard extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color accent;
  final Color iconBg;
  final int played;
  final int won;

  const _StatCard({
    required this.label, required this.icon, required this.accent,
    required this.iconBg, required this.played, required this.won,
  });

  @override
  Widget build(BuildContext context) {
    final pct = played > 0 ? won / played : 0.0;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: const BoxDecoration(
        color: kColorSurface,
        borderRadius: BorderRadius.all(Radius.circular(16)),
        boxShadow: [
          BoxShadow(color: Color(0x0A000000), blurRadius: 8, offset: Offset(0, 2)),
          BoxShadow(color: Color(0x04000000), blurRadius: 2),
        ],
      ),
      child: Column(children: [
        Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          Container(
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(
              color: iconBg, borderRadius: BorderRadius.circular(6)),
            child: Icon(icon, size: 14, color: accent),
          ),
          const SizedBox(width: 6),
          Text(label.toUpperCase(),
            style: TextStyle(
              color: accent, fontSize: 11, fontWeight: FontWeight.w700,
              letterSpacing: 0.8)),
        ]),
        const SizedBox(height: 12),
        TweenAnimationBuilder<double>(
          tween: Tween(begin: 0, end: pct),
          duration: const Duration(milliseconds: 1100),
          curve: Curves.easeOutCubic,
          builder: (_, v, __) => SizedBox(
            width: 88, height: 88,
            child: Stack(alignment: Alignment.center, children: [
              Positioned.fill(child: CircularProgressIndicator(
                value: v,
                strokeWidth: 9,
                backgroundColor: const Color(0x40334155),
                valueColor: AlwaysStoppedAnimation<Color>(accent),
                strokeCap: StrokeCap.round,
              )),
              Text('${(v * 100).round()}%',
                style: TextStyle(
                  color: accent, fontSize: 17,
                  fontWeight: FontWeight.w900)),
            ]),
          ),
        ),
        const SizedBox(height: 10),
        Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          Text('${won}W',
            style: const TextStyle(
              color: kColorEmerald, fontWeight: FontWeight.w700, fontSize: 12)),
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 4),
            child: Text('·', style: TextStyle(color: kColorMuted))),
          Text('${played - won}L',
            style: const TextStyle(
              color: kColorRose, fontWeight: FontWeight.w700, fontSize: 12)),
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 4),
            child: Text('·', style: TextStyle(color: kColorMuted))),
          Text('${played}P',
            style: const TextStyle(color: kColorMuted, fontSize: 12)),
        ]),
      ]),
    );
  }
}

// ── Streak card ──────────────────────────────────────────────────────────────

class _StreakCard extends StatelessWidget {
  final int current;
  final int best;
  const _StreakCard({required this.current, required this.best});

  @override
  Widget build(BuildContext context) {
    final isOnStreak = current > 1;
    return Container(
      decoration: BoxDecoration(
        gradient: isOnStreak
            ? const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xFF1A0A00), Color(0xFF2D1200), Color(0xFF1A0A00)],
              )
            : null,
        color: isOnStreak ? null : kColorSurface,
        borderRadius: const BorderRadius.all(Radius.circular(16)),
        boxShadow: isOnStreak ? [
          BoxShadow(
            color: const Color(0xFFF97316).withOpacity(0.3),
            blurRadius: 20, offset: const Offset(0, 6), spreadRadius: -4),
        ] : const [
          BoxShadow(color: Color(0x0A000000), blurRadius: 8, offset: Offset(0, 2)),
        ],
      ),
      padding: const EdgeInsets.all(16),
      child: Row(children: [
        Container(
          width: 52, height: 52,
          decoration: BoxDecoration(
            color: const Color(0xFFF97316).withOpacity(isOnStreak ? 0.20 : 0.12),
            borderRadius: BorderRadius.circular(14),
            boxShadow: isOnStreak ? [
              BoxShadow(
                color: const Color(0xFFF97316).withOpacity(0.4),
                blurRadius: 16, spreadRadius: 0),
            ] : [],
          ),
          alignment: Alignment.center,
          child: const Icon(Icons.local_fire_department_rounded,
            color: Color(0xFFF97316), size: 28),
        ),
        const SizedBox(width: 16),
        Expanded(child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('WIN STREAK',
              style: TextStyle(
                color: isOnStreak ? const Color(0xFFFED7AA) : kColorMuted,
                fontSize: 10, fontWeight: FontWeight.w800, letterSpacing: 1)),
            const SizedBox(height: 6),
            Row(children: [
              Text(current.toString(),
                style: TextStyle(
                  color: isOnStreak ? Colors.white : kColorText,
                  fontWeight: FontWeight.w900, fontSize: 32, height: 1,
                  letterSpacing: -1)),
              const SizedBox(width: 8),
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('current',
                  style: TextStyle(
                    color: isOnStreak ? const Color(0xFFFED7AA) : kColorMuted,
                    fontSize: 11)),
                const SizedBox(height: 2),
                Row(children: [
                  Text('$best',
                    style: const TextStyle(
                      color: Color(0xFFF97316), fontWeight: FontWeight.w900, fontSize: 16)),
                  const SizedBox(width: 4),
                  Text('best',
                    style: TextStyle(
                      color: isOnStreak ? const Color(0xFFFED7AA) : kColorMuted,
                      fontSize: 11)),
                ]),
              ]),
            ]),
          ],
        )),
        if (isOnStreak)
          Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: const Color(0xFFF97316).withOpacity(0.2),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: const Color(0xFFF97316).withOpacity(0.4)),
                ),
                child: const Text('ON FIRE',
                  style: TextStyle(
                    color: Color(0xFFF97316), fontSize: 10, fontWeight: FontWeight.w900,
                    letterSpacing: 1)),
              ),
            ],
          ),
      ]),
    );
  }
}

// ── Rivals card ──────────────────────────────────────────────────────────────

class _RivalsCard extends StatelessWidget {
  final List<Map<String, dynamic>> wins;
  final List<Map<String, dynamic>> losses;
  const _RivalsCard({required this.wins, required this.losses});

  @override
  Widget build(BuildContext context) => Container(
    decoration: const BoxDecoration(
      color: kColorSurface,
      borderRadius: BorderRadius.all(Radius.circular(16)),
      boxShadow: [
        BoxShadow(color: Color(0x0A000000), blurRadius: 8, offset: Offset(0, 2)),
        BoxShadow(color: Color(0x04000000), blurRadius: 2),
      ],
    ),
    clipBehavior: Clip.hardEdge,
    child: IntrinsicHeight(
      child: Row(children: [
        if (wins.isNotEmpty)
          Expanded(child: _RivalsSection(
            title: 'DOMINATES',
            icon: Icons.bolt_rounded,
            color: kColorEmerald,
            items: wins.map((r) => (
              name: r['name']?.toString() ?? '',
              record: '${r['wins']}–0',
            )).toList(),
          )),
        if (wins.isNotEmpty && losses.isNotEmpty)
          Container(width: 1, color: const Color(0x18000000)),
        if (losses.isNotEmpty)
          Expanded(child: _RivalsSection(
            title: 'NEMESIS',
            icon: Icons.trending_down,
            color: kColorRose,
            items: losses.map((r) => (
              name: r['name']?.toString() ?? '',
              record: '0–${r['losses']}',
            )).toList(),
          )),
      ]),
    ),
  );
}

class _RivalsSection extends StatelessWidget {
  final String title;
  final IconData icon;
  final Color color;
  final List<({String name, String record})> items;

  const _RivalsSection({
    required this.title, required this.icon,
    required this.color, required this.items,
  });

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.all(14),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(children: [
          Icon(icon, color: color, size: 14),
          const SizedBox(width: 4),
          Text(title, style: TextStyle(
            color: color, fontSize: 10, fontWeight: FontWeight.w800,
            letterSpacing: 0.8)),
        ]),
        const SizedBox(height: 10),
        ...items.map((r) => Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Row(children: [
            Expanded(child: Text(r.name,
              style: const TextStyle(
                color: kColorText, fontSize: 12, fontWeight: FontWeight.w500),
              overflow: TextOverflow.ellipsis)),
            const SizedBox(width: 8),
            Text(r.record, style: TextStyle(
              color: color, fontSize: 12, fontWeight: FontWeight.w800)),
          ]),
        )),
      ],
    ),
  );
}

// ── Recent matches ───────────────────────────────────────────────────────────

class _RecentMatchesCard extends StatelessWidget {
  final List<Map<String, dynamic>> matches;
  const _RecentMatchesCard({required this.matches});

  @override
  Widget build(BuildContext context) => Container(
    decoration: const BoxDecoration(
      color: kColorSurface,
      borderRadius: BorderRadius.all(Radius.circular(16)),
      boxShadow: [
        BoxShadow(color: Color(0x0A000000), blurRadius: 8, offset: Offset(0, 2)),
        BoxShadow(color: Color(0x04000000), blurRadius: 2),
      ],
    ),
    clipBehavior: Clip.hardEdge,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 14, 14, 6),
          child: Row(children: [
            const Text('RECENT MATCHES',
              style: TextStyle(color: kColorMuted, fontSize: 10,
                fontWeight: FontWeight.w800, letterSpacing: 0.8)),
            const Spacer(),
            Text('${matches.length} shown',
              style: const TextStyle(color: kColorMuted, fontSize: 10)),
          ]),
        ),
        ...matches.map((m) => _MatchRow(match: m)),
      ],
    ),
  );
}

class _MatchRow extends StatelessWidget {
  final Map<String, dynamic> match;
  const _MatchRow({required this.match});

  @override
  Widget build(BuildContext context) {
    final result = match['result']?.toString() ?? '';
    final isWin  = result == 'win';
    final isLoss = result == 'loss';
    final accent = isWin ? kColorEmerald : isLoss ? kColorRose : kColorMuted;
    final type   = match['match_type']?.toString() ?? 'singles';
    final score  = _parseScore(match['score_details']);
    final date   = match['match_date']?.toString() ?? '';
    final label  = type == 'singles'
        ? 'vs ${match['opponent_name'] ?? 'Unknown'}'
        : 'w/ ${match['partner_name'] ?? 'Partner'} (Doubles)';

    return Container(
      decoration: BoxDecoration(
        border: Border(left: BorderSide(color: accent, width: 3)),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(children: [
          Container(
            width: 32, height: 32,
            decoration: BoxDecoration(
              color: type == 'singles'
                  ? const Color(0x1A0EA5E9)
                  : const Color(0x1AA855F7),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(
              type == 'singles' ? Icons.person_outline : Icons.people_outline,
              size: 14,
              color: type == 'singles'
                  ? const Color(0xFF0EA5E9) : const Color(0xFFA855F7),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label,
                style: const TextStyle(
                  color: kColorText, fontWeight: FontWeight.w600,
                  fontSize: 13),
                overflow: TextOverflow.ellipsis),
              const SizedBox(height: 2),
              Text('$score · ${_relativeDate(date)}',
                style: const TextStyle(color: kColorMuted, fontSize: 11)),
            ],
          )),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: accent.withOpacity(0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(result.toUpperCase(),
              style: TextStyle(
                color: accent, fontSize: 10, fontWeight: FontWeight.w800,
                letterSpacing: 0.5)),
          ),
        ]),
      ),
    );
  }
}

// ── Phase 2: ratings, weekly streak, clan ranks, badges ─────────────────────

const _cardDecoration = BoxDecoration(
  color: kColorSurface,
  borderRadius: BorderRadius.all(Radius.circular(16)),
  boxShadow: [
    BoxShadow(color: Color(0x0A000000), blurRadius: 8, offset: Offset(0, 2)),
    BoxShadow(color: Color(0x04000000), blurRadius: 2),
  ],
);

class _CardLabel extends StatelessWidget {
  final String text;
  final IconData icon;
  final Color color;
  const _CardLabel(this.text, this.icon, this.color);

  @override
  Widget build(BuildContext context) => Row(children: [
    Icon(icon, size: 14, color: color),
    const SizedBox(width: 6),
    Text(text, style: TextStyle(
      color: color, fontSize: 10, fontWeight: FontWeight.w800, letterSpacing: 0.8)),
  ]);
}

class _RatingsCard extends StatelessWidget {
  final PlayerProgress progress;
  const _RatingsCard({required this.progress});

  Widget _cell(String label, PublicRating r, bool primary) => Expanded(
    child: Column(children: [
      Text(label.toUpperCase(), style: TextStyle(
        color: primary ? kColorPrimary : kColorMuted,
        fontSize: 10, fontWeight: FontWeight.w800, letterSpacing: 0.8)),
      const SizedBox(height: 8),
      SizedBox(
        height: 32,
        child: Center(child: RatingLabel(
          rating: r.rating, provisional: r.provisional, fontSize: 26,
          color: primary ? kColorPrimary : kColorText)),
      ),
      const SizedBox(height: 4),
      Text(
        r.provisional
            ? (r.matches == 0 ? 'No rated matches yet' : '${r.matches} rated so far')
            : '${r.matches} rated matches',
        style: const TextStyle(color: kColorMuted, fontSize: 11)),
    ]),
  );

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(14),
    decoration: _cardDecoration,
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const _CardLabel('RATING', Icons.insights_rounded, kColorPrimary),
      const SizedBox(height: 12),
      Row(children: [
        _cell('Singles', progress.ratings.singles, progress.format == 'singles'),
        Container(width: 1, height: 56, color: const Color(0x14000000)),
        _cell('Doubles', progress.ratings.doubles, progress.format == 'doubles'),
      ]),
    ]),
  );
}

class _WeeklyStreakCard extends StatelessWidget {
  final Streak streak;
  const _WeeklyStreakCard({required this.streak});

  @override
  Widget build(BuildContext context) {
    final on = streak.current > 0;
    const fire = Color(0xFFF97316);
    final status = !on
        ? 'Play a match this week to start a streak'
        : streak.playedThisWeek
            ? 'Played this week'
            : 'Play before Sunday night to keep it going';
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: _cardDecoration,
      child: Row(children: [
        Container(
          width: 48, height: 48,
          decoration: BoxDecoration(
            color: fire.withValues(alpha: on ? 0.18 : 0.08),
            borderRadius: BorderRadius.circular(14),
          ),
          alignment: Alignment.center,
          child: Icon(Icons.local_fire_department_rounded,
              color: on ? fire : kColorMuted, size: 26),
        ),
        const SizedBox(width: 14),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('WEEKLY STREAK', style: TextStyle(
            color: kColorMuted, fontSize: 10, fontWeight: FontWeight.w800, letterSpacing: 0.8)),
          const SizedBox(height: 4),
          Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Text('${streak.current}', style: const TextStyle(
              color: kColorText, fontSize: 26, fontWeight: FontWeight.w900, height: 1)),
            const SizedBox(width: 4),
            Text(streak.current == 1 ? 'week' : 'weeks',
              style: const TextStyle(color: kColorMuted, fontSize: 12)),
            const SizedBox(width: 12),
            Text('Best ${streak.best}', style: const TextStyle(
              color: fire, fontSize: 12, fontWeight: FontWeight.w800)),
          ]),
          const SizedBox(height: 4),
          Text(status, style: TextStyle(
            color: streak.atRisk ? kColorRose : kColorMuted, fontSize: 11,
            fontWeight: streak.atRisk ? FontWeight.w700 : FontWeight.w400)),
        ])),
      ]),
    );
  }
}

class _ClanRanksCard extends StatelessWidget {
  final PlayerProgress progress;
  const _ClanRanksCard({required this.progress});

  @override
  Widget build(BuildContext context) {
    final fmt = progress.format == 'doubles' ? 'doubles' : 'singles';
    final provisional = progress.ratings.of(progress.format).provisional;
    final month = seasonDisplayName(progress.season).split(' ').first;
    return Container(
      decoration: _cardDecoration,
      clipBehavior: Clip.hardEdge,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Padding(
          padding: EdgeInsets.fromLTRB(14, 14, 14, 6),
          child: _CardLabel('RANK IN EACH CLAN', Icons.leaderboard_rounded, kColorAmber),
        ),
        for (final c in progress.clans)
          InkWell(
            onTap: () => context.push('/clans/${c.clanId}'),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              child: Row(children: [
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(c.name, overflow: TextOverflow.ellipsis, style: const TextStyle(
                    color: kColorText, fontSize: 13, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 2),
                  Text(
                    c.seasonRank != null
                        ? '$month: #${c.seasonRank} of ${c.seasonPlayers} · ${_pts(c.seasonPoints)} pts'
                        : '$month: no matches yet',
                    style: const TextStyle(color: kColorMuted, fontSize: 11)),
                ])),
                const SizedBox(width: 8),
                Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                  Text(
                    provisional || c.ratingRank == 0 ? 'Provisional' : '#${c.ratingRank}',
                    style: TextStyle(
                      color: provisional ? kColorMuted : kColorAmber,
                      fontSize: provisional ? 12 : 18, fontWeight: FontWeight.w900)),
                  Text('of ${c.members} · $fmt',
                    style: const TextStyle(color: kColorMuted, fontSize: 10)),
                ]),
              ]),
            ),
          ),
        const SizedBox(height: 4),
      ]),
    );
  }

  static String _pts(num? v) {
    if (v == null) return '0';
    return v % 1 == 0 ? v.toInt().toString() : v.toStringAsFixed(1);
  }
}

class _BadgesCard extends StatelessWidget {
  final List<SeasonBadge> badges;
  const _BadgesCard({required this.badges});

  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(14),
    decoration: _cardDecoration,
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      _CardLabel('BADGES (${badges.length})', Icons.workspace_premium_rounded, kColorViolet),
      const SizedBox(height: 10),
      Wrap(spacing: 8, runSpacing: 8, children: [
        for (final b in badges) SeasonBadgeChip(badge: b, showContext: true),
      ]),
    ]),
  );
}
