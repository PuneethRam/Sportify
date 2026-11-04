import 'package:flutter/material.dart';
import '../core/theme.dart';

// ── Submit feedback ───────────────────────────────────────────────────────────

/// Snackbar text for an `/api/clans/update_match` response. Results submitted
/// by non-admins stay pending until a player on the other side confirms.
String matchSubmitMessage(Map<String, dynamic> res, {required String confirmed}) =>
    res['status'] == 'pending'
        ? 'Result submitted — awaiting opponent confirmation'
        : confirmed;

// ── Pending results section ───────────────────────────────────────────────────

/// Lists items from `/api/clans/matches/pending` with Confirm / Dispute
/// actions (only for rows the caller is allowed to resolve).
class PendingResultsSection extends StatelessWidget {
  final List<Map<String, dynamic>> items;
  final String? busyId;
  final void Function(Map<String, dynamic> item, String action) onAction;

  const PendingResultsSection({
    super.key,
    required this.items,
    required this.onAction,
    this.busyId,
  });

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      const Padding(
        padding: EdgeInsets.only(bottom: 8),
        child: Text('PENDING RESULTS', style: TextStyle(
          fontSize: 10, fontWeight: FontWeight.w700,
          color: kColorMuted, letterSpacing: 1)),
      ),
      ...items.map((item) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: _PendingResultCard(
          item: item,
          busy: busyId != null && busyId == item['submissionId']?.toString(),
          onAction: (action) => onAction(item, action),
        ),
      )),
    ],
  );
}

class _PendingResultCard extends StatelessWidget {
  final Map<String, dynamic> item;
  final bool busy;
  final ValueChanged<String> onAction;

  const _PendingResultCard({
    required this.item, required this.busy, required this.onAction});

  static List<String> _names(dynamic raw) => raw is List
      ? raw.map((p) => p is Map ? p['name']?.toString() ?? '' : p.toString())
          .where((n) => n.isNotEmpty).toList()
      : <String>[];

  @override
  Widget build(BuildContext context) {
    final disputed   = item['status'] == 'disputed';
    final canConfirm = item['canConfirm'] == true;
    final color = disputed ? kColorRose : canConfirm ? kColorAmber : kColorMuted;
    final label = disputed
        ? 'Disputed'
        : canConfirm ? 'Awaiting your confirmation' : 'Awaiting opponent';

    final rawScore = item['score'];
    final score = rawScore is Map ? rawScore['score']?.toString() : rawScore?.toString();
    final team1 = _names(item['team1Players']).join(' & ');
    final team2 = _names(item['team2Players']).join(' & ');
    final winner = item['winner']?.toString();
    final by = item['submittedByName']?.toString();

    TextStyle teamStyle(bool won) => TextStyle(
      color: won ? kColorText : kColorMuted,
      fontSize: 13,
      fontWeight: won ? FontWeight.w800 : FontWeight.w500,
    );

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: kColorSurface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withValues(alpha: 0.25)),
        boxShadow: const [
          BoxShadow(color: Color(0x0A000000), blurRadius: 8, offset: Offset(0, 2)),
        ],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(label.toUpperCase(), style: TextStyle(
              color: color, fontSize: 10, fontWeight: FontWeight.w800)),
          ),
          const Spacer(),
          Text((item['matchType']?.toString() ?? '').toUpperCase(),
            style: const TextStyle(color: kColorMuted, fontSize: 10,
              fontWeight: FontWeight.w600, letterSpacing: 0.5)),
        ]),
        const SizedBox(height: 10),
        Text.rich(TextSpan(children: [
          TextSpan(text: team1.isEmpty ? 'Team 1' : team1, style: teamStyle(winner == 'team1')),
          const TextSpan(text: '  vs  ', style: TextStyle(color: kColorMuted, fontSize: 11)),
          TextSpan(text: team2.isEmpty ? 'Team 2' : team2, style: teamStyle(winner == 'team2')),
        ])),
        if (score != null && score.isNotEmpty) ...[
          const SizedBox(height: 4),
          Text(score, style: const TextStyle(
            color: kColorText, fontSize: 13, fontWeight: FontWeight.w700)),
        ],
        if (by != null && by.isNotEmpty) ...[
          const SizedBox(height: 4),
          Text('Submitted by $by', style: const TextStyle(color: kColorMuted, fontSize: 11)),
        ],
        if (canConfirm) ...[
          const SizedBox(height: 10),
          Row(children: [
            Expanded(child: OutlinedButton(
              onPressed: busy ? null : () => onAction('reject'),
              style: OutlinedButton.styleFrom(
                foregroundColor: kColorRose,
                minimumSize: const Size(0, 38),
                padding: const EdgeInsets.symmetric(vertical: 8),
              ),
              child: Text(disputed ? 'Reject' : 'Dispute'),
            )),
            const SizedBox(width: 8),
            Expanded(child: ElevatedButton(
              onPressed: busy ? null : () => onAction('confirm'),
              style: ElevatedButton.styleFrom(
                backgroundColor: kColorEmerald,
                minimumSize: const Size(0, 38),
                padding: const EdgeInsets.symmetric(vertical: 8),
              ),
              child: busy
                  ? const SizedBox(width: 16, height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('Confirm'),
            )),
          ]),
        ],
      ]),
    );
  }
}
