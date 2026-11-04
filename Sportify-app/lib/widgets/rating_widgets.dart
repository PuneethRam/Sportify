import 'package:flutter/material.dart';
import '../core/theme.dart';
import '../models/progress_model.dart';

/// "+14" (green) / "−9" (red) rating change chip.
class RatingChangeChip extends StatelessWidget {
  final int delta;
  final String? name;
  const RatingChangeChip({super.key, required this.delta, this.name});

  @override
  Widget build(BuildContext context) {
    final color = delta > 0 ? kColorEmerald : delta < 0 ? kColorRose : kColorMuted;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.25)),
      ),
      child: Text.rich(
        TextSpan(children: [
          if (name != null)
            TextSpan(
              text: '$name ',
              style: const TextStyle(color: kColorMuted, fontWeight: FontWeight.w500)),
          TextSpan(text: formatRatingChange(delta)),
        ]),
        semanticsLabel: '${name ?? 'Rating'} ${delta >= 0 ? 'up' : 'down'} ${delta.abs()}',
        style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w800),
      ),
    );
  }
}

/// Wrap of rating change chips for the players in [ids] (names from [names]),
/// skipping anyone without a change. Empty if nothing was rated.
class RatingChangeRow extends StatelessWidget {
  final Map<String, int> changes;
  final List<String> ids;
  final List<String> names;
  const RatingChangeRow({
    super.key,
    required this.changes,
    required this.ids,
    required this.names,
  });

  @override
  Widget build(BuildContext context) {
    final chips = <Widget>[];
    for (var i = 0; i < ids.length; i++) {
      final d = changes[ids[i]];
      if (d == null) continue;
      final n = i < names.length ? names[i].trim().split(' ').first : null;
      chips.add(RatingChangeChip(delta: d, name: n));
    }
    if (chips.isEmpty) return const SizedBox.shrink();
    return Wrap(spacing: 6, runSpacing: 4, children: chips);
  }
}

/// Rating number, or a "Provisional" pill while the rating is unsettled.
class RatingLabel extends StatelessWidget {
  final int? rating;
  final bool provisional;
  final double fontSize;
  final Color? color;
  const RatingLabel({
    super.key,
    required this.rating,
    required this.provisional,
    this.fontSize = 20,
    this.color,
  });

  @override
  Widget build(BuildContext context) {
    if (provisional || rating == null) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: kColorMuted.withValues(alpha: 0.10),
          borderRadius: BorderRadius.circular(8),
        ),
        child: const Text('Provisional',
            style: TextStyle(color: kColorMuted, fontSize: 11, fontWeight: FontWeight.w700)),
      );
    }
    return Text('$rating',
        style: TextStyle(
            color: color ?? kColorText, fontSize: fontSize, fontWeight: FontWeight.w900));
  }
}

IconData badgeIcon(String badge) => switch (badge) {
      'champion' => Icons.emoji_events_rounded,
      'top3' => Icons.military_tech_rounded,
      'most_matches' => Icons.local_fire_department_rounded,
      'biggest_gain' => Icons.trending_up_rounded,
      _ => Icons.workspace_premium_rounded,
    };

Color badgeColor(String badge) => switch (badge) {
      'champion' => kColorGold,
      'top3' => const Color(0xFF94A3B8),
      'most_matches' => const Color(0xFFF97316),
      'biggest_gain' => kColorEmerald,
      _ => kColorPrimary,
    };

/// A season badge: icon + label (+ optional season / clan line).
class SeasonBadgeChip extends StatelessWidget {
  final SeasonBadge badge;
  final bool showContext;
  const SeasonBadgeChip({super.key, required this.badge, this.showContext = false});

  @override
  Widget build(BuildContext context) {
    final color = badgeColor(badge.badge);
    final where = [
      if (badge.seasonName != null) badge.seasonName!,
      if (badge.clanName != null && badge.clanName!.isNotEmpty) badge.clanName!,
    ].join(' · ');
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(badgeIcon(badge.badge), size: 16, color: color),
        const SizedBox(width: 6),
        Flexible(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(badge.label,
                  style: const TextStyle(
                      color: kColorText, fontSize: 12, fontWeight: FontWeight.w700)),
              if (showContext && where.isNotEmpty)
                Text(where,
                    style: const TextStyle(color: kColorMuted, fontSize: 10),
                    overflow: TextOverflow.ellipsis),
            ],
          ),
        ),
      ]),
    );
  }
}
