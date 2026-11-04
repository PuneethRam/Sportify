import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';
import '../services/analytics.dart';
import '../services/api_service.dart';

/// Gets (or with [rotate], replaces) the invite link for a clan / batch /
/// session and opens the share sheet.
Future<void> shareInvite(BuildContext context, {
  required String type,
  required int id,
  required String name,
  bool rotate = false,
}) async {
  final messenger = ScaffoldMessenger.of(context);
  try {
    final res = await ApiService.instance.post('/api/invites', {
      'type': type,
      'id': id,
      if (rotate) 'rotate': true,
    });
    final url = res['url']?.toString();
    if (url == null || url.isEmpty) throw ApiException('No invite link returned', 500);
    Analytics.instance.track('invite_link_created', {
      'target_type': type,
      'created': res['created'] == true,
    });
    final label = name.trim().isEmpty ? 'my ${type == 'session' ? 'game' : type}' : name.trim();
    await Share.share('Join $label on Sportify: $url', subject: 'Join $label on Sportify');
  } on ApiException catch (e) {
    messenger.showSnackBar(SnackBar(content: Text(e.statusCode == 403
        ? "You don't have permission to invite people here"
        : e.message)));
  } catch (e) {
    messenger.showSnackBar(SnackBar(content: Text(e.toString())));
  }
}

/// Share icon: tap shares the invite link, long-press offers to reset it.
class InviteShareButton extends StatefulWidget {
  final String type;
  final int id;
  final String name;
  final Color? color;
  final double size;

  const InviteShareButton({
    super.key,
    required this.type,
    required this.id,
    required this.name,
    this.color,
    this.size = 20,
  });

  @override
  State<InviteShareButton> createState() => _InviteShareButtonState();
}

class _InviteShareButtonState extends State<InviteShareButton> {
  bool _busy = false;

  Future<void> _share({bool rotate = false}) async {
    if (_busy) return;
    setState(() => _busy = true);
    await shareInvite(context,
        type: widget.type, id: widget.id, name: widget.name, rotate: rotate);
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _reset() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Reset invite link?'),
        content: const Text('Links you already shared will stop working.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Reset')),
        ],
      ),
    );
    if (ok == true && mounted) await _share(rotate: true);
  }

  @override
  Widget build(BuildContext context) => GestureDetector(
    onLongPress: _busy ? null : _reset,
    // No tooltip: it would take the long-press
    child: IconButton(
      onPressed: _busy ? null : _share,
      icon: _busy
          ? SizedBox(width: widget.size - 4, height: widget.size - 4,
              child: CircularProgressIndicator(strokeWidth: 2, color: widget.color))
          : Icon(Icons.person_add_alt_1_rounded, size: widget.size, color: widget.color),
    ),
  );
}
