import 'package:flutter/material.dart';
import '../core/theme.dart';

// ── Card shadow preset ─────────────────────────────────────────────────────────
const _kCardShadow = [
  BoxShadow(color: Color(0x0A000000), blurRadius: 8, offset: Offset(0, 2)),
  BoxShadow(color: Color(0x06000000), blurRadius: 2, offset: Offset(0, 0)),
];

class AppCard extends StatelessWidget {
  final Widget child;
  final Color? accentColor;
  final EdgeInsetsGeometry? padding;
  final VoidCallback? onTap;

  const AppCard({
    super.key,
    required this.child,
    this.accentColor,
    this.padding,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final content = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (accentColor != null)
          Container(
            height: 3,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [accentColor!, accentColor!.withOpacity(0.5)],
              ),
              borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
            ),
          ),
        Padding(
          padding: padding ?? const EdgeInsets.all(16),
          child: child,
        ),
      ],
    );

    if (onTap != null) {
      return Material(
        color: kColorSurface,
        borderRadius: BorderRadius.circular(16),
        clipBehavior: Clip.hardEdge,
        child: InkWell(
          onTap: onTap,
          child: DecoratedBox(
            decoration: const BoxDecoration(
              boxShadow: _kCardShadow,
            ),
            child: content,
          ),
        ),
      );
    }

    return Container(
      decoration: const BoxDecoration(
        color: kColorSurface,
        borderRadius: BorderRadius.all(Radius.circular(16)),
        boxShadow: _kCardShadow,
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: content,
      ),
    );
  }
}

// ── Stat Tile (used inside dark gradient heroes) ───────────────────────────────

class StatTile extends StatelessWidget {
  final String label;
  final String value;
  final Color? valueColor;

  const StatTile({
    super.key,
    required this.label,
    required this.value,
    this.valueColor,
  });

  @override
  Widget build(BuildContext context) => Column(
    mainAxisSize: MainAxisSize.min,
    children: [
      Text(
        value,
        style: TextStyle(
          color: valueColor ?? Colors.white,
          fontSize: 24,
          fontWeight: FontWeight.w900,
          letterSpacing: -0.5,
        ),
      ),
      const SizedBox(height: 3),
      Text(
        label.toUpperCase(),
        style: const TextStyle(
          color: Color(0xFF94A3B8),
          fontSize: 10,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.8,
        ),
      ),
    ],
  );
}

// ── Section Heading ───────────────────────────────────────────────────────────

class SectionHeading extends StatelessWidget {
  final String text;
  final Widget? trailing;

  const SectionHeading(this.text, {super.key, this.trailing});

  @override
  Widget build(BuildContext context) => Row(
    crossAxisAlignment: CrossAxisAlignment.center,
    children: [
      Text(
        text,
        style: const TextStyle(
          color: kColorText,
          fontSize: 15,
          fontWeight: FontWeight.w800,
          letterSpacing: -0.2,
        ),
      ),
      if (trailing != null) ...[
        const Spacer(),
        trailing!,
      ],
    ],
  );
}

// ── Stat Row (compact inline stat with label) ─────────────────────────────────

class StatRow extends StatelessWidget {
  final IconData icon;
  final String value;
  final String label;
  final Color? color;

  const StatRow({
    super.key,
    required this.icon,
    required this.value,
    required this.label,
    this.color,
  });

  @override
  Widget build(BuildContext context) => Row(
    children: [
      Icon(icon, size: 14, color: color ?? kColorMuted),
      const SizedBox(width: 5),
      Text(value, style: TextStyle(
        color: color ?? kColorText,
        fontWeight: FontWeight.w700,
        fontSize: 13,
      )),
      const SizedBox(width: 4),
      Text(label, style: const TextStyle(color: kColorMuted, fontSize: 12)),
    ],
  );
}
