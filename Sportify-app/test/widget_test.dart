import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sportify_app/widgets/pending_results.dart';

// The full app needs Firebase, so widget tests cover Firebase-free widgets.
void main() {
  Map<String, dynamic> item(String id, {required bool canConfirm, String status = 'pending'}) => {
    'submissionId': id,
    'matchType': 'singles',
    'status': status,
    'submittedByName': 'Asha',
    'score': '21-15, 21-18',
    'team1Players': [{'id': 'a', 'name': 'Asha'}],
    'team2Players': [{'id': 'b', 'name': 'Ravi'}],
    'winner': 'team1',
    'canConfirm': canConfirm,
  };

  testWidgets('pending results: actions only for confirmable rows', (tester) async {
    final actions = <String>[];
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: SingleChildScrollView(
          child: PendingResultsSection(
            items: [item('s1', canConfirm: true), item('s2', canConfirm: false)],
            onAction: (i, a) => actions.add('${i['submissionId']}:$a'),
          ),
        ),
      ),
    ));

    expect(find.text('AWAITING YOUR CONFIRMATION'), findsOneWidget);
    expect(find.text('AWAITING OPPONENT'), findsOneWidget);
    expect(find.text('Confirm'), findsOneWidget);

    await tester.tap(find.text('Confirm'));
    await tester.tap(find.text('Dispute'));
    expect(actions, ['s1:confirm', 's1:reject']);
  });

  test('submit message reflects pending status', () {
    expect(matchSubmitMessage({'status': 'pending'}, confirmed: 'ok'),
        contains('awaiting opponent'));
    expect(matchSubmitMessage({'status': 'confirmed'}, confirmed: 'ok'), 'ok');
  });
}
