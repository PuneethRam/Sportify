import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/constants.dart';
import '../../core/theme.dart';
import '../../services/api_service.dart';

class CreateSessionScreen extends StatefulWidget {
  const CreateSessionScreen({super.key});

  @override
  State<CreateSessionScreen> createState() => _CreateSessionScreenState();
}

class _CreateSessionScreenState extends State<CreateSessionScreen> {
  final _titleCtrl    = TextEditingController();
  final _locationCtrl = TextEditingController();
  final _descCtrl     = TextEditingController();
  final _formKey      = GlobalKey<FormState>();

  String _sport       = 'Badminton';
  String _skill       = 'any';
  int    _maxPlayers  = 4;
  DateTime _scheduledAt = DateTime.now().add(const Duration(hours: 1));
  bool _saving = false;

  @override
  void dispose() {
    _titleCtrl.dispose();
    _locationCtrl.dispose();
    _descCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickDateTime() async {
    final date = await showDatePicker(
      context: context,
      initialDate: _scheduledAt,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 30)),
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: Theme.of(ctx).colorScheme.copyWith(primary: kColorPrimary)),
        child: child!,
      ),
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_scheduledAt),
    );
    if (time == null) return;
    setState(() {
      _scheduledAt = DateTime(
        date.year, date.month, date.day, time.hour, time.minute);
    });
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() => _saving = true);
    try {
      await ApiService.instance.post('/api/game-sessions', {
        'title': _titleCtrl.text.trim(),
        'sport': _sport,
        'location': _locationCtrl.text.trim(),
        'scheduled_at': _scheduledAt.toIso8601String(),
        'max_players': _maxPlayers,
        'skill_level': _skill,
        'description': _descCtrl.text.trim(),
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Session created!')));
        context.pop();
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Host a Session')),
    body: Form(
      key: _formKey,
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          // Sport selector
          const Text('Sport', style: TextStyle(
            color: kColorMuted, fontSize: 12, fontWeight: FontWeight.w700,
            letterSpacing: 0.8)),
          const SizedBox(height: 8),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(children: kSports.map((s) {
              final emoji = kSportCfg[s]?['emoji'] ?? '🎯';
              final hex   = kSportCfg[s]?['color'] ?? '94a3b8';
              final color = Color(int.parse('FF$hex', radix: 16));
              final sel   = _sport == s;
              return Padding(
                padding: const EdgeInsets.only(right: 6),
                child: GestureDetector(
                  onTap: () => setState(() => _sport = s),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: sel ? color.withOpacity(0.2) : Colors.black.withOpacity(0.04),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: sel ? color.withOpacity(0.5) : Colors.black.withOpacity(0.1)),
                    ),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      Text(emoji, style: const TextStyle(fontSize: 16)),
                      const SizedBox(width: 6),
                      Text(s, style: TextStyle(
                        color: sel ? color : kColorMuted,
                        fontWeight: FontWeight.w600, fontSize: 12)),
                    ]),
                  ),
                ),
              );
            }).toList()),
          ),

          const SizedBox(height: 20),
          TextFormField(
            controller: _titleCtrl,
            decoration: const InputDecoration(labelText: 'Session Title'),
            textCapitalization: TextCapitalization.sentences,
            validator: (v) => (v == null || v.trim().isEmpty) ? 'Required' : null,
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _locationCtrl,
            decoration: const InputDecoration(
              labelText: 'Location',
              prefixIcon: Icon(Icons.location_on_outlined, size: 18),
            ),
            validator: (v) => (v == null || v.trim().isEmpty) ? 'Required' : null,
          ),
          const SizedBox(height: 20),

          // Date/time picker
          GestureDetector(
            onTap: _pickDateTime,
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.black.withOpacity(0.04),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: Colors.black.withOpacity(0.1)),
              ),
              child: Row(children: [
                const Icon(Icons.calendar_today_outlined,
                  size: 18, color: kColorPrimary),
                const SizedBox(width: 10),
                Expanded(child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Date & Time', style: TextStyle(
                      color: kColorMuted, fontSize: 11, fontWeight: FontWeight.w600)),
                    Text(DateFormat('EEE, MMM d · h:mm a').format(_scheduledAt),
                      style: const TextStyle(color: kColorText,
                        fontWeight: FontWeight.w600, fontSize: 14)),
                  ],
                )),
                const Icon(Icons.chevron_right_rounded, color: kColorMuted),
              ]),
            ),
          ),
          const SizedBox(height: 20),

          // Max players
          Row(children: [
            const Expanded(child: Text('Max Players',
              style: TextStyle(color: kColorMuted, fontSize: 13))),
            Row(children: [
              IconButton(
                icon: const Icon(Icons.remove_circle_outline, color: kColorPrimary),
                onPressed: _maxPlayers > 2
                    ? () => setState(() => _maxPlayers--) : null,
              ),
              Text('$_maxPlayers', style: const TextStyle(
                color: kColorText, fontWeight: FontWeight.w800, fontSize: 18)),
              IconButton(
                icon: const Icon(Icons.add_circle_outline, color: kColorPrimary),
                onPressed: _maxPlayers < 20
                    ? () => setState(() => _maxPlayers++) : null,
              ),
            ]),
          ]),
          const SizedBox(height: 12),

          // Skill level
          const Text('Skill Level', style: TextStyle(
            color: kColorMuted, fontSize: 12, fontWeight: FontWeight.w700,
            letterSpacing: 0.8)),
          const SizedBox(height: 8),
          Wrap(spacing: 6, children: kSkillLevels.map((s) {
            Color c;
            switch (s) {
              case 'beginner':     c = kColorEmerald; break;
              case 'intermediate': c = kColorAmber;   break;
              case 'advanced':     c = kColorRose;    break;
              default:             c = kColorMuted;
            }
            return ChoiceChip(
              label: Text(s == 'any' ? 'Any Level'
                  : s[0].toUpperCase() + s.substring(1)),
              selected: _skill == s,
              selectedColor: c.withOpacity(0.2),
              onSelected: (_) => setState(() => _skill = s),
            );
          }).toList()),
          const SizedBox(height: 16),

          TextFormField(
            controller: _descCtrl,
            decoration: const InputDecoration(labelText: 'Description (optional)'),
            maxLines: 3,
          ),
          const SizedBox(height: 24),

          ElevatedButton(
            onPressed: _saving ? null : _submit,
            child: _saving
                ? const SizedBox(width: 20, height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Text('Create Session'),
          ),
        ],
      ),
    ),
  );
}
