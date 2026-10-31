// Set this to your backend URL.
// Android emulator  → http://10.0.2.2:3000
// iOS simulator     → http://localhost:3000
// Physical device   → http://<your-machine-ip>:3000
// Production        → https://your-domain.com
const String kApiBase = 'https://sportifyweb.netlify.app';

// Sport config: color, emoji
const Map<String, Map<String, String>> kSportCfg = {
  'Badminton':    {'color': '6366f1', 'emoji': '🏸'},
  'Tennis':       {'color': 'f59e0b', 'emoji': '🎾'},
  'Football':     {'color': '22c55e', 'emoji': '⚽'},
  'Cricket':      {'color': '3b82f6', 'emoji': '🏏'},
  'Basketball':   {'color': 'f97316', 'emoji': '🏀'},
  'Pickleball':   {'color': '14b8a6', 'emoji': '🏓'},
  'Table Tennis': {'color': 'ec4899', 'emoji': '🏓'},
  'Other':        {'color': '94a3b8', 'emoji': '🎯'},
};

const List<String> kSports = [
  'Badminton', 'Tennis', 'Football', 'Cricket',
  'Basketball', 'Pickleball', 'Table Tennis', 'Other',
];

const List<String> kSkillLevels = ['any', 'beginner', 'intermediate', 'advanced'];
