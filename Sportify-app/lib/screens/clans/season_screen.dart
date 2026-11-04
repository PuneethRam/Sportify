import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme.dart';
import '../../models/progress_model.dart';
import '../../services/api_service.dart';
import '../../widgets/loading_screen.dart';
import '../../widgets/rating_widgets.dart';

/// A clan's / batch's monthly season: standing (season points from this
/// month's confirmed matches) and, once the month is over, its badges.
/// Shown as a full page from clan detail and the academy batch screen.
class SeasonScreen extends StatelessWidget {
  final String clanId;
  final String? clanName;
  const SeasonScreen({super.key, required this.clanId, this.clanName});

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: kColorBg,
        appBar: AppBar(
          title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Season'),
            if (clanName != null && clanName!.isNotEmpty)
              Text(clanName!,
                  style: const TextStyle(color: kColorMuted, fontSize: 12, fontWeight: FontWeight.w500)),
          ]),
        ),
        body: SeasonView(clanId: clanId),
      );
}

class SeasonView extends StatefulWidget {
  final String clanId;
  const SeasonView({super.key, required this.clanId});

  @override
  State<SeasonView> createState() => _SeasonViewState();
}

class _SeasonViewState extends State<SeasonView> {
  SeasonData? _data;
  String? _current; // this month, from the server (India time)
  String? _selected;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load([String? season]) async {
    setState(() { _loading = true; _error = null; _selected = season ?? _selected; });
    try {
      final res = await ApiService.instance.getSeason(widget.clanId, season: _selected);
      final data = SeasonData.fromJson(res);
      if (!mounted) return;
      setState(() {
        _data = data;
        // The first load (no season param) tells us this month, India time
        if (data.current) _current = data.season;
        _selected = data.season;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _error = e.statusCode == 403 ? 'Only members can see this season' : e.message;
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() { _error = e.toString(); _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading && _data == null) return const CenteredLoader();
    if (_error != null && _data == null) return ErrorView(message: _error!, onRetry: _load);
    final data = _data!;
    final seasons = recentSeasons(_current ?? data.season);

    return RefreshIndicator(
      onRefresh: () => _load(_selected),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        children: [
          // Month picker: this month, then previous months
          SizedBox(
            height: 40,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: seasons.length,
              separatorBuilder: (_, __) => const SizedBox(width: 6),
              itemBuilder: (_, i) {
                final s = seasons[i];
                final label = i == 0 ? 'This month' : seasonDisplayName(s).split(' ').first;
                return ChoiceChip(
                  label: Text(label),
                  selected: s == _selected,
                  onSelected: _loading ? null : (_) => _load(s),
                );
              },
            ),
          ),
          const SizedBox(height: 12),
          if (_loading) const LinearProgressIndicator(minHeight: 2),
          _Header(data: data),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(_error!, style: const TextStyle(color: kColorRose, fontSize: 12)),
          ],
          if (data.badges.isNotEmpty) ...[
            const SizedBox(height: 16),
            const _SectionLabel('BADGES'),
            const SizedBox(height: 8),
            Wrap(spacing: 8, runSpacing: 8, children: [
              for (final b in data.badges)
                _NamedBadge(badge: b, clanId: widget.clanId),
            ]),
          ],
          const SizedBox(height: 16),
          const _SectionLabel('STANDING'),
          const SizedBox(height: 8),
          if (data.standings.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 32),
              child: EmptyView(
                message: data.current
                    ? 'No results this season yet.\nPlay a match to get on the board.'
                    : 'No matches were played this season.',
                icon: Icons.emoji_events_outlined,
              ),
            )
          else
            for (final s in data.standings)
              _StandingRow(
                standing: s,
                badges: data.badgesFor(s.userId),
                clanId: widget.clanId,
              ),
        ],
      ),
    );
  }
}

class _Header extends StatelessWidget {
  final SeasonData data;
  const _Header({required this.data});

  @override
  Widget build(BuildContext context) {
    final players = data.standings.length;
    final matches = data.standings.fold<int>(0, (n, s) => n + s.played);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF070D1C), Color(0xFF0B1E3E)],
        ),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Row(children: [
        const Icon(Icons.calendar_month_rounded, color: kColorGold, size: 28),
        const SizedBox(width: 12),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('${data.seasonName} season',
              style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w900)),
          const SizedBox(height: 3),
          Text(
            data.current
                ? 'In progress · badges are awarded when the month ends'
                : 'Final standing',
            style: const TextStyle(color: Colors.white70, fontSize: 12),
          ),
        ])),
        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Text('$players', style: const TextStyle(color: kColorGold, fontSize: 18, fontWeight: FontWeight.w900)),
          Text(players == 1 ? 'player' : 'players', style: const TextStyle(color: Colors.white60, fontSize: 10)),
          // Every match counts once per player
          if (matches > 0)
            Text('$matches plays', style: const TextStyle(color: Colors.white38, fontSize: 10)),
        ]),
      ]),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  final String text;
  const _SectionLabel(this.text);
  @override
  Widget build(BuildContext context) => Text(text,
      style: const TextStyle(
          color: kColorMuted, fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 1.5));
}

class _NamedBadge extends StatelessWidget {
  final SeasonBadge badge;
  final String clanId;
  const _NamedBadge({required this.badge, required this.clanId});

  @override
  Widget build(BuildContext context) {
    final color = badgeColor(badge.badge);
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: badge.userId == null ? null : () => context.push('/clans/$clanId/player/${badge.userId}'),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color.withValues(alpha: 0.35)),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(badgeIcon(badge.badge), color: color, size: 18),
          const SizedBox(width: 8),
          Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
            Text(badge.name ?? 'Player',
                style: const TextStyle(color: kColorText, fontSize: 13, fontWeight: FontWeight.w800)),
            Text(_detail(),
                style: const TextStyle(color: kColorMuted, fontSize: 11)),
          ]),
        ]),
      ),
    );
  }

  String _detail() {
    final v = badge.value;
    return switch (badge.badge) {
      'champion' || 'top3' => '${badge.label}${badge.rank != null ? ' · #${badge.rank}' : ''}',
      'most_matches' => '${badge.label}${v != null ? ' · $v' : ''}',
      'biggest_gain' => '${badge.label}${v != null ? ' · +$v' : ''}',
      _ => badge.label,
    };
  }
}

class _StandingRow extends StatelessWidget {
  final SeasonStanding standing;
  final List<SeasonBadge> badges;
  final String clanId;
  const _StandingRow({required this.standing, required this.badges, required this.clanId});

  static const _medal = [kColorGold, Color(0xFFB0BEC5), Color(0xFFCD7F32)];

  @override
  Widget build(BuildContext context) {
    final s = standing;
    final top = s.rank >= 1 && s.rank <= 3;
    final rankColor = top ? _medal[s.rank - 1] : kColorMuted;
    final rating = s.ratings?.of(s.ratings!.primaryFormat);
    final pts = s.points % 1 == 0 ? s.points.toInt().toString() : s.points.toStringAsFixed(1);

    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: () => context.push('/clans/$clanId/player/${s.userId}'),
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: top ? rankColor.withValues(alpha: 0.07) : kColorSurface,
          borderRadius: BorderRadius.circular(14),
          boxShadow: const [BoxShadow(color: Color(0x0A000000), blurRadius: 6, offset: Offset(0, 2))],
        ),
        child: Row(children: [
          SizedBox(
            width: 32,
            child: Text('#${s.rank}',
                textAlign: TextAlign.center,
                style: TextStyle(color: rankColor, fontWeight: FontWeight.w900, fontSize: 14)),
          ),
          const SizedBox(width: 8),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Flexible(child: Text(s.name,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: kColorText, fontWeight: FontWeight.w700, fontSize: 14))),
              for (final b in badges) ...[
                const SizedBox(width: 4),
                Tooltip(
                  message: b.label,
                  child: Icon(badgeIcon(b.badge), size: 16, color: badgeColor(b.badge)),
                ),
              ],
            ]),
            const SizedBox(height: 3),
            Row(children: [
              Text('${s.won}W', style: const TextStyle(color: kColorEmerald, fontSize: 11, fontWeight: FontWeight.w700)),
              const SizedBox(width: 5),
              Text('${s.lost}L', style: const TextStyle(color: kColorRose, fontSize: 11, fontWeight: FontWeight.w700)),
              const SizedBox(width: 8),
              Text('${s.played} played', style: const TextStyle(color: kColorMuted, fontSize: 11)),
              if (rating != null) ...[
                const SizedBox(width: 8),
                Text(rating.provisional ? 'Provisional' : 'Rating ${rating.rating}',
                    style: const TextStyle(color: kColorMuted, fontSize: 11)),
              ],
            ]),
          ])),
          const SizedBox(width: 8),
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Text(pts, style: TextStyle(
                color: top ? rankColor : kColorAmber, fontWeight: FontWeight.w900, fontSize: 18)),
            const Text('pts', style: TextStyle(color: kColorMuted, fontSize: 10, fontWeight: FontWeight.w600)),
          ]),
        ]),
      ),
    );
  }
}
