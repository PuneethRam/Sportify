import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme.dart';
import '../../models/clan_model.dart';
import '../../services/api_service.dart';
import '../../widgets/loading_screen.dart';
import '../../widgets/rating_widgets.dart';

/// Leaderboard tabs: Glicko-2 rating per format, plus the legacy clan points.
const _modes = ['singles', 'doubles', 'points'];

/// Orders members for a tab. Rating tabs: rated players by rating (highest
/// first), then provisional players, as the server ranks them.
List<ClanMember> rankMembers(List<ClanMember> members, String mode) {
  final list = [...members];
  if (mode == 'points') {
    list.sort((a, b) => b.clanPoints.compareTo(a.clanPoints));
  } else {
    list.sort((a, b) => ClanMember.compareByRating(a, b, mode));
  }
  return list;
}

class LeaderboardTab extends StatefulWidget {
  final String clanId;
  const LeaderboardTab({super.key, required this.clanId});

  @override
  State<LeaderboardTab> createState() => _LeaderboardTabState();
}

class _LeaderboardTabState extends State<LeaderboardTab>
    with SingleTickerProviderStateMixin, AutomaticKeepAliveClientMixin {
  late final TabController _tabs;
  List<ClanMember> _members = [];
  bool _loading = true;
  String _search = '';

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: _modes.length, vsync: this);
    _load();
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  Future<void> _load({bool fresh = false}) async {
    try {
      final data = await ApiService.instance.get(
        '/api/clans/leaderboard',
        query: {'clanId': widget.clanId},
        cached: !fresh,
      );
      if (!mounted) return;
      setState(() {
        _members = (data['data'] as List? ?? [])
            .map((e) => ClanMember.fromJson(e as Map<String, dynamic>)).toList();
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    if (_loading) return const CenteredLoader();

    return Column(children: [
      TabBar(
        controller: _tabs,
        tabs: const [Tab(text: 'Singles'), Tab(text: 'Doubles'), Tab(text: 'Points')],
      ),
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
        child: TextField(
          onChanged: (v) => setState(() => _search = v),
          decoration: const InputDecoration(
            labelText: 'Search player',
            prefixIcon: Icon(Icons.search, size: 18),
            isDense: true,
          ),
        ),
      ),
      Expanded(
        child: TabBarView(
          controller: _tabs,
          children: _modes.map((mode) {
            // Rank over everyone, then filter, so ranks don't shift while searching
            final ranked = rankMembers(_members, mode);
            final q = _search.toLowerCase();
            final rows = <({ClanMember member, int rank})>[
              for (var i = 0; i < ranked.length; i++)
                if (q.isEmpty || ranked[i].name.toLowerCase().contains(q))
                  (member: ranked[i], rank: i + 1),
            ];
            if (rows.isEmpty) return const EmptyView(message: 'No data');

            final isRating = mode != 'points';
            final rated = isRating
                ? rows.where((r) => !r.member.provisionalFor(mode)).toList()
                : rows;
            final provisional = isRating
                ? rows.where((r) => r.member.provisionalFor(mode)).toList()
                : const <({ClanMember member, int rank})>[];
            final podium = q.isEmpty && rated.length >= 3;
            final body = podium ? rated.skip(3).toList() : rated;

            return RefreshIndicator(
              onRefresh: () => _load(fresh: true),
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  if (podium)
                    _Podium(
                      members: rated.take(3).map((r) => r.member).toList(),
                      mode: mode,
                      clanId: widget.clanId,
                    ),
                  if (isRating && rated.isEmpty)
                    const Padding(
                      padding: EdgeInsets.only(bottom: 12),
                      child: Text(
                        'No one has a settled rating yet. Ratings appear after a few matches.',
                        style: TextStyle(color: kColorMuted, fontSize: 12)),
                    ),
                  for (final r in body)
                    _MemberRow(member: r.member, rank: r.rank, mode: mode, clanId: widget.clanId),
                  if (provisional.isNotEmpty) ...[
                    const Padding(
                      padding: EdgeInsets.fromLTRB(4, 12, 4, 8),
                      child: Text('PROVISIONAL · STILL SETTLING IN',
                        style: TextStyle(color: kColorMuted, fontSize: 10,
                          fontWeight: FontWeight.w700, letterSpacing: 1.2)),
                    ),
                    for (final r in provisional)
                      _MemberRow(member: r.member, rank: r.rank, mode: mode, clanId: widget.clanId),
                  ],
                ],
              ),
            );
          }).toList(),
        ),
      ),
    ]);
  }
}

class _Podium extends StatelessWidget {
  final List<ClanMember> members;
  final String mode;
  final String clanId;
  const _Podium({required this.members, required this.mode, required this.clanId});

  static const _colors = [
    Color(0xFFB0BEC5), // silver (#2)
    Color(0xFFFBBF24), // gold (#1)
    Color(0xFFCD7F32), // bronze (#3)
  ];
  static const _ranks = [2, 1, 3];
  static const _heights = [22.0, 36.0, 14.0];

  @override
  Widget build(BuildContext context) {
    // Order: 2nd on left, 1st in center, 3rd on right
    final ordered = [members[1], members[0], members[2]];

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF070D1C), Color(0xFF0B1E3E)],
        ),
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFFFBBF24).withOpacity(0.18),
            blurRadius: 24, offset: const Offset(0, 8)),
        ],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Row(children: [
          Icon(Icons.emoji_events_rounded, color: Color(0xFFFBBF24), size: 15),
          SizedBox(width: 6),
          Text('TOP PLAYERS', style: TextStyle(
            color: Color(0xFFFBBF24), fontSize: 10, fontWeight: FontWeight.w800,
            letterSpacing: 1.5)),
        ]),
        const SizedBox(height: 16),
        Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: List.generate(3, (i) {
            final member = ordered[i];
            final rank = _ranks[i];
            final color = _colors[i];
            final pedHeight = _heights[i];
            final isChamp = rank == 1;
            final value = mode == 'points'
                ? '${member.clanPoints} pts'
                : '${member.ratingFor(mode) ?? '-'}';
            final initials = member.name.isNotEmpty
                ? member.name[0].toUpperCase() : '?';

            return Expanded(child: GestureDetector(
              onTap: () => context.push('/clans/$clanId/player/${member.userId}'),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  // Rank badge
                  Container(
                    width: 22, height: 22,
                    decoration: BoxDecoration(
                      color: color, shape: BoxShape.circle),
                    alignment: Alignment.center,
                    child: Text('$rank', style: const TextStyle(
                      color: Colors.white, fontSize: 11, fontWeight: FontWeight.w900)),
                  ),
                  const SizedBox(height: 8),
                  // Glowing avatar
                  Container(
                    width: isChamp ? 64.0 : 50.0,
                    height: isChamp ? 64.0 : 50.0,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: LinearGradient(
                        colors: [color, color.withOpacity(0.6)]),
                      boxShadow: [
                        BoxShadow(
                          color: color.withOpacity(isChamp ? 0.55 : 0.3),
                          blurRadius: isChamp ? 20.0 : 10.0,
                          spreadRadius: isChamp ? 2.0 : 0.0),
                      ],
                    ),
                    child: Padding(
                      padding: EdgeInsets.all(isChamp ? 3.0 : 2.5),
                      child: Container(
                        decoration: const BoxDecoration(
                          shape: BoxShape.circle,
                          color: Color(0xFF0B1E3E)),
                        alignment: Alignment.center,
                        child: Text(initials, style: TextStyle(
                          color: Colors.white,
                          fontSize: isChamp ? 22.0 : 17.0,
                          fontWeight: FontWeight.w900)),
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  // Name (first word only)
                  Text(
                    member.name.split(' ').first,
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: isChamp ? 13.0 : 11.0,
                      fontWeight: FontWeight.w700),
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 2),
                  Text(value, style: TextStyle(
                    color: color,
                    fontSize: isChamp ? 12.0 : 10.0,
                    fontWeight: FontWeight.w800)),
                  const SizedBox(height: 8),
                  // Podium base
                  Container(
                    height: pedHeight,
                    decoration: BoxDecoration(
                      color: color.withOpacity(0.22),
                      borderRadius: const BorderRadius.vertical(
                        top: Radius.circular(4)),
                    ),
                  ),
                ],
              ),
            ));
          }),
        ),
      ]),
    );
  }
}

class _MemberRow extends StatelessWidget {
  final ClanMember member;
  final int rank;
  final String mode;
  final String clanId;

  const _MemberRow({
    required this.member, required this.rank,
    required this.mode, required this.clanId,
  });

  static const _rankColors = [
    Color(0xFFFBBF24), // gold
    Color(0xFFB0BEC5), // silver
    Color(0xFFCD7F32), // bronze
  ];

  @override
  Widget build(BuildContext context) {
    final isRating = mode != 'points';
    final played = mode == 'points'
        ? member.matchesPlayed
        : mode == 'singles' ? member.singlesPlayed : member.doublesPlayed;
    final won = mode == 'points'
        ? member.matchesWon
        : mode == 'singles' ? member.singlesWon : member.doublesWon;
    final winRate = played > 0 ? won / played : 0.0;
    final provisional = isRating && member.provisionalFor(mode);

    // Provisional players aren't medalled
    final isTop3 = rank <= 3 && !provisional;
    final rankColor = isTop3 ? _rankColors[rank - 1] : kColorMuted;

    Widget badge;
    if (isTop3) {
      badge = Container(
        width: 34, height: 34,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: rankColor.withOpacity(0.15),
          border: Border.all(color: rankColor.withOpacity(0.5), width: 1.5),
        ),
        alignment: Alignment.center,
        child: Text('$rank', style: TextStyle(
          color: rankColor, fontSize: 13, fontWeight: FontWeight.w900)),
      );
    } else {
      badge = SizedBox(
        width: 34,
        child: Text('#$rank', textAlign: TextAlign.center,
          style: const TextStyle(color: kColorMuted,
            fontWeight: FontWeight.w600, fontSize: 12)),
      );
    }

    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: () => context.push('/clans/$clanId/player/${member.userId}'),
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: isTop3 ? rankColor.withOpacity(0.06) : kColorSurface,
          borderRadius: BorderRadius.circular(14),
          boxShadow: [
            BoxShadow(
              color: isTop3 ? rankColor.withOpacity(0.15) : const Color(0x0A000000),
              blurRadius: 8, offset: const Offset(0, 2)),
          ],
        ),
        child: Row(children: [
          badge,
          const SizedBox(width: 10),
          Container(
            width: 38, height: 38,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: kColorPrimary.withOpacity(0.10),
            ),
            alignment: Alignment.center,
            child: Text(
              member.name.isNotEmpty ? member.name[0].toUpperCase() : '?',
              style: const TextStyle(
                color: kColorPrimary, fontWeight: FontWeight.w700, fontSize: 15)),
          ),
          const SizedBox(width: 12),
          Expanded(child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(member.name, style: const TextStyle(
                fontWeight: FontWeight.w700, fontSize: 13, color: kColorText),
                overflow: TextOverflow.ellipsis),
              const SizedBox(height: 5),
              Row(children: [
                Text('${won}W', style: const TextStyle(
                  color: kColorEmerald, fontSize: 11, fontWeight: FontWeight.w700)),
                const SizedBox(width: 5),
                Text('${played - won}L', style: const TextStyle(
                  color: kColorRose, fontSize: 11, fontWeight: FontWeight.w700)),
                if (played > 0) ...[
                  const SizedBox(width: 8),
                  Expanded(child: ClipRRect(
                    borderRadius: BorderRadius.circular(3),
                    child: LinearProgressIndicator(
                      value: winRate,
                      minHeight: 4,
                      backgroundColor: Colors.black.withOpacity(0.08),
                      valueColor: const AlwaysStoppedAnimation(kColorEmerald),
                    ),
                  )),
                  const SizedBox(width: 6),
                  Text('${(winRate * 100).round()}%',
                    style: const TextStyle(
                      color: kColorEmerald, fontSize: 10, fontWeight: FontWeight.w700)),
                ],
              ]),
            ],
          )),
          const SizedBox(width: 12),
          if (isRating)
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              RatingLabel(
                rating: member.ratingFor(mode),
                provisional: provisional,
                color: isTop3 ? rankColor : kColorPrimary,
              ),
              if (!provisional)
                const Text('rating', style: TextStyle(
                  color: kColorMuted, fontSize: 10, fontWeight: FontWeight.w600)),
            ])
          else
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text('${member.clanPoints}', style: TextStyle(
                color: isTop3 ? rankColor : kColorAmber,
                fontWeight: FontWeight.w900, fontSize: 20)),
              const Text('pts', style: TextStyle(
                color: kColorMuted, fontSize: 10, fontWeight: FontWeight.w600)),
            ]),
        ]),
      ),
    );
  }
}
