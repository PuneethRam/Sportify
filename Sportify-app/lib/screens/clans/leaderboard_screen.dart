import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme.dart';
import '../../models/clan_model.dart';
import '../../services/api_service.dart';
import '../../widgets/loading_screen.dart';

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
        '/api/clans/leaderboard',
        query: {'clanId': widget.clanId},
      );
      setState(() {
        _members = (data['data'] as List? ?? [])
            .map((e) => ClanMember.fromJson(e as Map<String, dynamic>)).toList();
        _loading = false;
      });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  List<ClanMember> _sorted(int tabIdx) {
    final filtered = _search.isEmpty
        ? _members
        : _members.where(
            (m) => m.name.toLowerCase().contains(_search.toLowerCase())).toList();
    if (tabIdx == 0) {
      return [...filtered]..sort((a, b) => b.clanPoints.compareTo(a.clanPoints));
    } else if (tabIdx == 1) {
      return [...filtered]..sort((a, b) => b.singlesPoints.compareTo(a.singlesPoints));
    } else {
      return [...filtered]..sort((a, b) => b.doublesPoints.compareTo(a.doublesPoints));
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    if (_loading) return const CenteredLoader();

    return Column(children: [
      TabBar(
        controller: _tabs,
        tabs: const [Tab(text: 'Overall'), Tab(text: 'Singles'), Tab(text: 'Doubles')],
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
          children: List.generate(3, (tabIdx) {
            final list = _sorted(tabIdx);
            if (list.isEmpty) return const EmptyView(message: 'No data');
            final showPodium = tabIdx == 0 && _search.isEmpty && list.length >= 3;
            final extraItems = showPodium ? 1 : 0;
            return ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: list.length + extraItems,
              itemBuilder: (_, i) {
                if (showPodium && i == 0) {
                  return _Podium(
                    members: list.take(3).toList(),
                    tabIdx: tabIdx,
                    clanId: widget.clanId,
                  );
                }
                final realIdx = i - extraItems;
                return _MemberRow(
                  member: list[realIdx], rank: realIdx + 1, tabIdx: tabIdx,
                  clanId: widget.clanId);
              },
            );
          }),
        ),
      ),
    ]);
  }
}

class _Podium extends StatelessWidget {
  final List<ClanMember> members;
  final int tabIdx;
  final String clanId;
  const _Podium({required this.members, required this.tabIdx, required this.clanId});

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
            final pts = tabIdx == 0 ? member.clanPoints
                : tabIdx == 1 ? member.singlesPoints : member.doublesPoints;
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
                  Text('$pts pts', style: TextStyle(
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
  final int tabIdx;
  final String clanId;

  const _MemberRow({
    required this.member, required this.rank,
    required this.tabIdx, required this.clanId,
  });

  static const _rankColors = [
    Color(0xFFFBBF24), // gold
    Color(0xFFB0BEC5), // silver
    Color(0xFFCD7F32), // bronze
  ];

  @override
  Widget build(BuildContext context) {
    final pts = tabIdx == 0
        ? member.clanPoints
        : tabIdx == 1 ? member.singlesPoints : member.doublesPoints;

    final played = tabIdx == 0
        ? member.matchesPlayed
        : tabIdx == 1 ? member.singlesPlayed : member.doublesPlayed;
    final won = tabIdx == 0
        ? member.matchesWon
        : tabIdx == 1 ? member.singlesWon : member.doublesWon;
    final winRate = played > 0 ? won / played : 0.0;

    final isTop3 = rank <= 3;
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
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Text('$pts', style: TextStyle(
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
