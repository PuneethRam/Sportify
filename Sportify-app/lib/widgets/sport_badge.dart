import 'package:flutter/material.dart';
import '../core/constants.dart';

class SportBadge extends StatelessWidget {
  final String sport;
  final bool small;

  const SportBadge(this.sport, {super.key, this.small = false});

  @override
  Widget build(BuildContext context) {
    final cfg   = kSportCfg[sport] ?? kSportCfg['Other']!;
    final emoji = cfg['emoji']!;
    final hex   = cfg['color']!;
    final color = Color(int.parse('FF$hex', radix: 16));

    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: small ? 8 : 10,
        vertical: small ? 3 : 5,
      ),
      decoration: BoxDecoration(
        color: color.withOpacity(0.15),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(emoji, style: TextStyle(fontSize: small ? 12 : 14)),
          const SizedBox(width: 4),
          Text(
            sport,
            style: TextStyle(
              color: color,
              fontSize: small ? 11 : 13,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

Color sportColor(String sport) {
  final hex = kSportCfg[sport]?['color'] ?? '94a3b8';
  return Color(int.parse('FF$hex', radix: 16));
}
