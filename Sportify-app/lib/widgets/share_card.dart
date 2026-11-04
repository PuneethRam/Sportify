import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';
import '../services/analytics.dart';
import '../services/api_service.dart';

/// Gets a public share link (/s/<token>, whose preview image is the rank
/// card) and opens the native share sheet. Same pattern as shareInvite().
///
///   match:   [source] 'clan_singles' | 'clan_doubles' | 'tournament', [matchId]
///   profile: the signed-in user's own profile, optionally in [clanId]
Future<void> shareCard(
  BuildContext context, {
  required String kind,
  String? source,
  int? matchId,
  int? clanId,
  required String message,
}) async {
  final messenger = ScaffoldMessenger.of(context);
  try {
    final res = await ApiService.instance.createShareLink(
        kind: kind, source: source, matchId: matchId, clanId: clanId);
    final url = res['url']?.toString();
    if (url == null || url.isEmpty) throw ApiException('No share link returned', 500);
    Analytics.instance.track('share_card_created', {
      'kind': kind,
      if (source != null) 'source': source,
    });
    await Share.share('$message $url', subject: message);
  } on ApiException catch (e) {
    messenger.showSnackBar(SnackBar(content: Text(e.statusCode == 403
        ? "You can't share this"
        : e.message)));
  } catch (e) {
    messenger.showSnackBar(SnackBar(content: Text(e.toString())));
  }
}

/// Share icon for a confirmed match result or the user's own profile.
class ShareCardButton extends StatefulWidget {
  final String kind;
  final String? source;
  final int? matchId;
  final int? clanId;
  final String message;
  final Color? color;
  final double size;
  final String? label;

  const ShareCardButton({
    super.key,
    required this.kind,
    this.source,
    this.matchId,
    this.clanId,
    required this.message,
    this.color,
    this.size = 18,
    this.label,
  });

  @override
  State<ShareCardButton> createState() => _ShareCardButtonState();
}

class _ShareCardButtonState extends State<ShareCardButton> {
  bool _busy = false;

  Future<void> _share() async {
    if (_busy) return;
    setState(() => _busy = true);
    await shareCard(context,
        kind: widget.kind,
        source: widget.source,
        matchId: widget.matchId,
        clanId: widget.clanId,
        message: widget.message);
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final icon = _busy
        ? SizedBox(
            width: widget.size - 2,
            height: widget.size - 2,
            child: CircularProgressIndicator(strokeWidth: 2, color: widget.color))
        : Icon(Icons.ios_share_rounded, size: widget.size, color: widget.color);
    if (widget.label != null) {
      return TextButton.icon(
        onPressed: _busy ? null : _share,
        icon: icon,
        label: Text(widget.label!, style: TextStyle(color: widget.color)),
      );
    }
    return IconButton(
      tooltip: 'Share',
      visualDensity: VisualDensity.compact,
      onPressed: _busy ? null : _share,
      icon: icon,
    );
  }
}
