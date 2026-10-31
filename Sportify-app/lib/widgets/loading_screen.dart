import 'package:flutter/material.dart';
import '../core/theme.dart';

// ── Full-screen loading splash ─────────────────────────────────────────────────

class LoadingScreen extends StatelessWidget {
  final String? message;
  const LoadingScreen({super.key, this.message});

  @override
  Widget build(BuildContext context) => Scaffold(
    body: Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 56, height: 56,
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                begin: Alignment.topLeft, end: Alignment.bottomRight,
                colors: [Color(0xFF0369A1), kColorPrimary],
              ),
              borderRadius: BorderRadius.circular(16),
              boxShadow: [
                BoxShadow(color: kColorPrimary.withOpacity(0.35),
                  blurRadius: 16, offset: const Offset(0, 6)),
              ],
            ),
            child: const Icon(Icons.sports_tennis_rounded, color: Colors.white, size: 28),
          ),
          const SizedBox(height: 20),
          const SizedBox(
            width: 24, height: 24,
            child: CircularProgressIndicator(
              color: kColorPrimary, strokeWidth: 2.5,
            ),
          ),
          if (message != null) ...[
            const SizedBox(height: 14),
            Text(message!, style: const TextStyle(color: kColorMuted, fontSize: 13)),
          ],
        ],
      ),
    ),
  );
}

// ── Centered spinner (used inside screen bodies) ───────────────────────────────

class CenteredLoader extends StatelessWidget {
  const CenteredLoader({super.key});

  @override
  Widget build(BuildContext context) => const Center(
    child: Padding(
      padding: EdgeInsets.all(48),
      child: SizedBox(
        width: 28, height: 28,
        child: CircularProgressIndicator(
          color: kColorPrimary, strokeWidth: 2.5, strokeCap: StrokeCap.round,
        ),
      ),
    ),
  );
}

// ── Shimmer skeleton cards (use instead of CenteredLoader for list screens) ───

class SkeletonLoader extends StatefulWidget {
  final int count;
  const SkeletonLoader({super.key, this.count = 3});

  @override
  State<SkeletonLoader> createState() => _SkeletonLoaderState();
}

class _SkeletonLoaderState extends State<SkeletonLoader>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _anim;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400))
      ..repeat();
    _anim = Tween<double>(begin: -1.5, end: 2.5).animate(
      CurvedAnimation(parent: _ctrl, curve: Curves.easeInOut));
  }

  @override
  void dispose() { _ctrl.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: _anim,
    builder: (_, __) => Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: List.generate(widget.count, (_) => _buildCard()),
      ),
    ),
  );

  Widget _buildCard() => Container(
    margin: const EdgeInsets.only(bottom: 12),
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: kColorSurface,
      borderRadius: BorderRadius.circular(16),
      boxShadow: const [
        BoxShadow(color: Color(0x0A000000), blurRadius: 8, offset: Offset(0, 2)),
      ],
    ),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        _sBox(48, 48, radius: 12),
        const SizedBox(width: 12),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          _sBox(double.infinity, 16),
          const SizedBox(height: 8),
          _sBox(100, 12),
        ])),
      ]),
      const SizedBox(height: 14),
      _sBox(double.infinity, 12),
      const SizedBox(height: 6),
      _sBox(180, 12),
    ]),
  );

  Widget _sBox(double width, double height, {double radius = 6}) {
    final dx = _anim.value;
    return Container(
      width: width == double.infinity ? null : width,
      height: height,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(radius),
        gradient: LinearGradient(
          begin: Alignment(dx - 1, 0),
          end: Alignment(dx + 1, 0),
          colors: const [
            Color(0xFFE2E8F0),
            Color(0xFFF1F5F9),
            Color(0xFFE2E8F0),
          ],
        ),
      ),
    );
  }
}

// ── Error View ─────────────────────────────────────────────────────────────────

class ErrorView extends StatelessWidget {
  final String message;
  final VoidCallback? onRetry;
  const ErrorView({super.key, required this.message, this.onRetry});

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 64, height: 64,
            decoration: BoxDecoration(
              color: kColorRose.withOpacity(0.1),
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.error_outline_rounded, color: kColorRose, size: 32),
          ),
          const SizedBox(height: 16),
          const Text('Something went wrong',
            style: TextStyle(color: kColorText, fontWeight: FontWeight.w700, fontSize: 16)),
          const SizedBox(height: 8),
          Text(message,
            style: const TextStyle(color: kColorMuted, fontSize: 13, height: 1.5),
            textAlign: TextAlign.center),
          if (onRetry != null) ...[
            const SizedBox(height: 20),
            SizedBox(
              width: 160,
              child: ElevatedButton.icon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh_rounded, size: 16),
                label: const Text('Try Again'),
              ),
            ),
          ],
        ],
      ),
    ),
  );
}

// ── Empty View ─────────────────────────────────────────────────────────────────

class EmptyView extends StatelessWidget {
  final String message;
  final IconData icon;
  final Widget? action;

  const EmptyView({
    super.key,
    required this.message,
    this.icon = Icons.inbox_outlined,
    this.action,
  });

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(40),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 72, height: 72,
            decoration: BoxDecoration(
              color: kColorMuted.withOpacity(0.08),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: kColorMuted.withOpacity(0.6), size: 36),
          ),
          const SizedBox(height: 16),
          Text(
            message,
            style: const TextStyle(
              color: kColorText, fontWeight: FontWeight.w600, fontSize: 15),
            textAlign: TextAlign.center,
          ),
          if (action != null) ...[
            const SizedBox(height: 20),
            action!,
          ],
        ],
      ),
    ),
  );
}
