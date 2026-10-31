import 'dart:async';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/constants.dart';
import '../../core/theme.dart';
import '../../models/game_session_model.dart';
import '../../services/api_service.dart';
import '../../widgets/loading_screen.dart';
import '../../widgets/sport_badge.dart';

class FindAMateScreen extends StatefulWidget {
  const FindAMateScreen({super.key});

  @override
  State<FindAMateScreen> createState() => _FindAMateScreenState();
}

class _FindAMateScreenState extends State<FindAMateScreen> {
  List<GameSession> _sessions = [];
  bool _loading = true;
  String? _error;
  String _sport      = 'all';
  String _skill      = 'any';
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _load();
    _timer = Timer.periodic(const Duration(seconds: 30), (_) {
      if (mounted) setState(() {}); // refresh countdown
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final data = await ApiService.instance.get('/api/game-sessions');
      setState(() {
        _sessions = (data['sessions'] as List? ?? data['data'] as List? ?? [])
            .map((e) => GameSession.fromJson(e)).toList();
        _loading = false;
      });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  List<GameSession> get _filtered => _sessions.where((s) {
    final sportOk = _sport == 'all' || s.sport == _sport;
    final skillOk = _skill == 'any'  || s.skillLevel == _skill;
    return sportOk && skillOk;
  }).toList()
    ..sort((a, b) => a.scheduledAt.compareTo(b.scheduledAt));

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Find a Mate'),
      actions: [
        IconButton(
          icon: const Icon(Icons.add_circle_outline, size: 22),
          onPressed: () => context.push('/find/create'),
          tooltip: 'Host a Session',
        ),
      ],
    ),
    body: _loading
        ? const CenteredLoader()
        : _error != null
            ? ErrorView(message: _error!, onRetry: _load)
            : Column(children: [
                _Filters(
                  sport: _sport, skill: _skill,
                  onSport: (v) => setState(() => _sport = v),
                  onSkill: (v) => setState(() => _skill = v),
                ),
                Expanded(
                  child: _filtered.isEmpty
                      ? EmptyView(
                          message: 'No open sessions right now',
                          icon: Icons.people_outline,
                          action: ElevatedButton(
                            onPressed: () => context.push('/find/create'),
                            child: const Text('Host a Session'),
                          ),
                        )
                      : RefreshIndicator(
                          onRefresh: _load,
                          color: kColorPrimary,
                          child: ListView.builder(
                            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                            itemCount: _filtered.length,
                            itemBuilder: (_, i) => Padding(
                              padding: const EdgeInsets.only(bottom: 12),
                              child: _SessionCard(session: _filtered[i]),
                            ),
                          ),
                        ),
                ),
              ]),
  );
}

class _Filters extends StatelessWidget {
  final String sport;
  final String skill;
  final ValueChanged<String> onSport;
  final ValueChanged<String> onSkill;

  const _Filters({
    required this.sport, required this.skill,
    required this.onSport, required this.onSkill,
  });

  @override
  Widget build(BuildContext context) => Container(
    color: kColorBg,
    child: Column(children: [
      SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
        child: Row(children: [
          _SportChip(label: 'All', selected: sport == 'all',
            onTap: () => onSport('all')),
          ...kSports.map((s) => _SportChip(
            label: s, selected: sport == s, onTap: () => onSport(s),
            emoji: kSportCfg[s]?['emoji'],
          )),
        ]),
      ),
      SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(16, 6, 16, 10),
        child: Row(children: [
          for (final s in ['any', 'beginner', 'intermediate', 'advanced'])
            Padding(
              padding: const EdgeInsets.only(right: 6),
              child: FilterChip(
                label: Text(s == 'any' ? 'Any Level'
                    : s[0].toUpperCase() + s.substring(1)),
                selected: skill == s,
                onSelected: (_) => onSkill(s),
              ),
            ),
        ]),
      ),
    ]),
  );
}

class _SportChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  final String? emoji;

  const _SportChip({required this.label, required this.selected,
    required this.onTap, this.emoji});

  @override
  Widget build(BuildContext context) {
    Color? accent;
    if (emoji != null && label != 'All') {
      final hex = kSportCfg[label]?['color'] ?? '94a3b8';
      accent = Color(int.parse('FF$hex', radix: 16));
    }

    return Padding(
      padding: const EdgeInsets.only(right: 6),
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: selected
                ? (accent ?? kColorPrimary).withOpacity(0.12)
                : Colors.black.withOpacity(0.04),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: selected
                  ? (accent ?? kColorPrimary).withOpacity(0.4)
                  : Colors.black.withOpacity(0.1)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (emoji != null) ...[
                Text(emoji!, style: const TextStyle(fontSize: 14)),
                const SizedBox(width: 4),
              ],
              Text(label, style: TextStyle(
                color: selected ? (accent ?? kColorPrimary) : kColorMuted,
                fontWeight: FontWeight.w600, fontSize: 13)),
            ],
          ),
        ),
      ),
    );
  }
}

class _SessionCard extends StatelessWidget {
  final GameSession session;
  const _SessionCard({required this.session});

  @override
  Widget build(BuildContext context) {
    final now      = DateTime.now();
    final diff     = session.scheduledAt.difference(now);
    final color    = sportColor(session.sport);
    final isFull   = session.isFull;

    String countdown;
    if (diff.isNegative) {
      countdown = 'Started';
    } else if (diff.inMinutes < 60) {
      countdown = 'in ${diff.inMinutes}m';
    } else if (diff.inHours < 24) {
      countdown = 'in ${diff.inHours}h ${diff.inMinutes.remainder(60)}m';
    } else {
      countdown = DateFormat('EEE, MMM d').format(session.scheduledAt);
    }

    Color skillColor;
    switch (session.skillLevel) {
      case 'beginner':     skillColor = kColorEmerald; break;
      case 'intermediate': skillColor = kColorAmber;   break;
      case 'advanced':     skillColor = kColorRose;    break;
      default:             skillColor = kColorMuted;
    }

    final spotsLeft = session.maxPlayers - session.joinedCount;
    final fillRatio = session.maxPlayers > 0
        ? session.joinedCount / session.maxPlayers : 0.0;

    return GestureDetector(
      onTap: () => context.push('/find/${session.sessionId}'),
      child: Opacity(
        opacity: isFull ? 0.65 : 1.0,
        child: Container(
          decoration: BoxDecoration(
            color: kColorSurface,
            borderRadius: BorderRadius.circular(18),
            boxShadow: [
              BoxShadow(color: color.withOpacity(0.15), blurRadius: 14, offset: const Offset(0, 4)),
              const BoxShadow(color: Color(0x06000000), blurRadius: 2),
            ],
          ),
          clipBehavior: Clip.hardEdge,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Thick top bar
              Container(
                height: 4,
                decoration: BoxDecoration(
                  gradient: LinearGradient(colors: [color, color.withOpacity(0.4)]),
                ),
              ),

              Padding(
                padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  // Header row
                  Row(children: [
                    // Sport emoji circle
                    Container(
                      width: 42, height: 42,
                      decoration: BoxDecoration(
                        color: color.withOpacity(0.12),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: color.withOpacity(0.2)),
                      ),
                      alignment: Alignment.center,
                      child: Text(kSportCfg[session.sport]?['emoji'] ?? '🎯',
                        style: const TextStyle(fontSize: 20)),
                    ),
                    const SizedBox(width: 12),
                    Expanded(child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(session.title, style: const TextStyle(
                          fontWeight: FontWeight.w800, fontSize: 15, color: kColorText,
                          letterSpacing: -0.2),
                          maxLines: 1, overflow: TextOverflow.ellipsis),
                        const SizedBox(height: 2),
                        Text('by ${session.hostName}',
                          style: const TextStyle(color: kColorMuted, fontSize: 12)),
                      ],
                    )),
                    // Countdown badge
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: isFull ? kColorMuted.withOpacity(0.12) : color.withOpacity(0.12),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color: isFull ? kColorMuted.withOpacity(0.2) : color.withOpacity(0.3)),
                      ),
                      child: Text(isFull ? 'FULL' : countdown, style: TextStyle(
                        color: isFull ? kColorMuted : color,
                        fontSize: 11, fontWeight: FontWeight.w800)),
                    ),
                  ]),

                  const SizedBox(height: 10),

                  // Location + skill + spots row
                  Row(children: [
                    const Icon(Icons.location_on_outlined, size: 12, color: kColorMuted),
                    const SizedBox(width: 3),
                    Expanded(child: Text(session.location,
                      style: const TextStyle(color: kColorMuted, fontSize: 11),
                      overflow: TextOverflow.ellipsis)),
                    const SizedBox(width: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: skillColor.withOpacity(0.12),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(session.skillLevel == 'any'
                          ? 'Any' : session.skillLevel[0].toUpperCase() +
                              session.skillLevel.substring(1),
                        style: TextStyle(color: skillColor, fontSize: 10,
                          fontWeight: FontWeight.w700)),
                    ),
                  ]),

                  const SizedBox(height: 10),

                  // Spots fill bar
                  Row(children: [
                    Expanded(child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(4),
                          child: LinearProgressIndicator(
                            value: fillRatio.clamp(0.0, 1.0),
                            minHeight: 5,
                            backgroundColor: color.withOpacity(0.10),
                            valueColor: AlwaysStoppedAnimation(
                              isFull ? kColorMuted : color),
                          ),
                        ),
                      ],
                    )),
                    const SizedBox(width: 10),
                    Row(children: [
                      Icon(Icons.people_rounded, size: 13,
                        color: isFull ? kColorMuted : color),
                      const SizedBox(width: 4),
                      Text(
                        isFull ? 'Full' : '$spotsLeft left',
                        style: TextStyle(
                          color: isFull ? kColorMuted : color,
                          fontSize: 11, fontWeight: FontWeight.w800)),
                      Text(' · ${session.joinedCount}/${session.maxPlayers}',
                        style: const TextStyle(color: kColorMuted, fontSize: 11)),
                    ]),
                  ]),
                ]),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
