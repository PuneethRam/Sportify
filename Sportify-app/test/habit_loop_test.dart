import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sportify_app/models/clan_model.dart';
import 'package:sportify_app/models/match_model.dart';
import 'package:sportify_app/models/progress_model.dart';
import 'package:sportify_app/screens/clans/bulk_results_screen.dart';
import 'package:sportify_app/screens/clans/leaderboard_screen.dart';
import 'package:sportify_app/services/api_service.dart';
import 'package:sportify_app/widgets/rating_widgets.dart';

ClanMember member(String id, {int? rating, bool provisional = false, int matches = 10, int points = 0}) =>
    ClanMember.fromJson({
      'user_id': id,
      'name': id,
      'clan_points': points,
      'singles_rating': rating,
      'singles_provisional': provisional,
      'singles_rated_matches': matches,
    });

void main() {
  group('ratings', () {
    test('formats rating changes with a true minus sign', () {
      expect(formatRatingChange(14), '+14');
      expect(formatRatingChange(-9), '−9');
      expect(formatRatingChange(0), '±0');
    });

    test('ClanMatch reads ratingChanges and source', () {
      final m = ClanMatch.fromJson({
        'id': '7',
        'type': 'doubles',
        'status': 'completed',
        'ratingChanges': {'a': 14, 'b': -9.4},
        'source': 'clan_doubles',
      });
      expect(m.ratingChanges, {'a': 14, 'b': -9});
      expect(m.shareSource, 'clan_doubles');
      expect(ClanMatch.fromJson({'id': '1', 'type': 'singles'}).shareSource, 'clan_singles');
    });

    test('leaderboard lists rated players by rating, then provisional ones', () {
      final ranked = rankMembers([
        member('new', rating: 1700, provisional: true, matches: 2),
        member('low', rating: 1450),
        member('high', rating: 1620),
        member('mid', rating: 1500),
      ], 'singles');
      expect(ranked.map((m) => m.userId), ['high', 'mid', 'low', 'new']);
    });

    test('points tab still sorts by clan points', () {
      final ranked = rankMembers([member('a', points: 3), member('b', points: 9)], 'points');
      expect(ranked.first.userId, 'b');
    });

    test('members without rating fields are provisional', () {
      final m = ClanMember.fromJson({'user_id': 'x', 'name': 'X'});
      expect(m.hasRatings, isFalse);
      expect(m.provisionalFor('singles'), isTrue);
    });
  });

  group('progress and seasons', () {
    test('parses /api/players/progress', () {
      final p = PlayerProgress.fromJson({
        'success': true,
        'userId': 'u1',
        'name': 'Asha',
        'ratings': {
          'singles': {'rating': 1623, 'rd': 80, 'matches': 12, 'provisional': false},
          'doubles': {'rating': 1500, 'rd': 350, 'matches': 1, 'provisional': true},
        },
        'format': 'singles',
        'streak': {'current': 4, 'best': 6, 'playedThisWeek': false},
        'badges': [
          {'clanId': 3, 'clanName': 'Smash', 'season': '2026-11', 'seasonName': 'November 2026',
           'badge': 'champion', 'label': 'Season champion', 'rank': 1, 'value': 42.5},
        ],
        'clans': [
          {'clanId': 3, 'name': 'Smash', 'type': 'group', 'ratingRank': 2, 'members': 9,
           'seasonRank': null, 'seasonPoints': null, 'seasonPlayers': 5},
        ],
        'season': '2026-12',
      });
      expect(p.ratings.singles.label, '1623');
      expect(p.ratings.doubles.label, 'Provisional');
      expect(p.streak.atRisk, isTrue);
      expect(p.badges.single.value, 42.5);
      expect(p.clans.single.seasonRank, isNull);
    });

    test('parses /api/clans/season and finds badges per player', () {
      final s = SeasonData.fromJson({
        'season': '2026-11',
        'seasonName': 'November 2026',
        'current': false,
        'standings': [
          {'userId': 'a', 'name': 'A', 'rank': 1, 'points': 12.5, 'played': 4, 'won': 3, 'lost': 1},
        ],
        'badges': [
          {'userId': 'a', 'name': 'A', 'badge': 'champion', 'label': 'Season champion', 'rank': 1, 'value': 12.5},
          {'userId': 'a', 'name': 'A', 'badge': 'most_matches', 'label': 'Most matches played', 'rank': null, 'value': 4},
        ],
      });
      expect(s.standings.single.points, 12.5);
      expect(s.badgesFor('a').map((b) => b.badge), ['champion', 'most_matches']);
      expect(s.badgesFor('b'), isEmpty);
    });

    test('season picker goes back across the year', () {
      expect(recentSeasons('2026-02', count: 3), ['2026-02', '2026-01', '2025-12']);
      expect(seasonDisplayName('2026-11'), 'November 2026');
    });
  });

  group('bulk entry rows', () {
    test('validates players and score', () {
      final r = BulkRow();
      expect(r.validate(), 'Pick both players');
      r.team1[0] = 'a';
      r.team2[0] = 'a';
      expect(r.validate(), 'A player can only appear once in a match');
      r.team2[0] = 'b';
      expect(r.validate(), startsWith('Enter the score'));
      r.score.text = '21-19, 19-21';
      expect(r.validate(), 'The score has no winner');
      r.score.text = '21-15 21:18';
      expect(r.validate(), isNull);
      expect(r.toJson(), {'matchType': 'singles', 'player1': 'a', 'player2': 'b', 'score': '21-15, 21-18'});
    });

    test('switching to doubles keeps the first players and needs four', () {
      final r = BulkRow(team1: ['a'], team2: ['b'], score: '21-10, 21-12');
      r.setType('doubles');
      expect(r.team1, ['a', null]);
      expect(r.validate(), 'Pick all four players');
      r.team1[1] = 'c';
      r.team2[1] = 'd';
      expect(r.toJson(), {
        'matchType': 'doubles',
        'team1Player1': 'a', 'team1Player2': 'c',
        'team2Player1': 'b', 'team2Player2': 'd',
        'score': '21-10, 21-12',
      });
      expect(r.copyPlayers().players, ['a', 'c', 'b', 'd']);
    });

    test('strips the server row prefix', () {
      expect(stripRowPrefix('Match 3: Missing player information'), 'Missing player information');
    });

    test('recordBulkMatches posts the batch and surfaces the bad row index', () async {
      http.Request? seen;
      final api = ApiService(
        client: MockClient((req) async {
          seen = req;
          return http.Response(
              jsonEncode({'success': false, 'error': 'Match 2: Invalid match type', 'index': 1}), 400);
        }),
        tokenProvider: ({bool forceRefresh = false}) async => 't',
        uidProvider: () => 'coach',
      );
      await expectLater(
        api.recordBulkMatches('5', [{'matchType': 'singles'}, {'matchType': 'x'}]),
        throwsA(isA<ApiException>()
            .having((e) => e.index, 'index', 1)
            .having((e) => e.statusCode, 'statusCode', 400)),
      );
      expect(seen!.url.path, '/api/clans/matches/bulk');
      expect(jsonDecode(seen!.body)['clanId'], '5');
    });
  });

  group('widgets', () {
    testWidgets('rating label shows Provisional instead of the number', (tester) async {
      await tester.pumpWidget(const MaterialApp(home: Scaffold(body: Column(children: [
        RatingLabel(rating: 1500, provisional: true),
        RatingLabel(rating: 1623, provisional: false),
        RatingChangeChip(delta: -9, name: 'Asha'),
      ]))));
      expect(find.text('Provisional'), findsOneWidget);
      expect(find.text('1623'), findsOneWidget);
      expect(find.textContaining('−9'), findsOneWidget);
    });
  });
}
