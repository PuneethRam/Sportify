import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'core/router.dart';
import 'core/theme.dart';
import 'firebase_options.dart';
import 'providers/auth_provider.dart';
import 'services/analytics.dart';
import 'services/deep_links.dart';
import 'services/push_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);

  // Crash reporting (mobile only) — off in debug so local crashes don't
  // pollute the dashboard
  if (!kIsWeb) {
    final crashlytics = FirebaseCrashlytics.instance;
    await crashlytics.setCrashlyticsCollectionEnabled(!kDebugMode);
    FlutterError.onError = crashlytics.recordFlutterFatalError;
    PlatformDispatcher.instance.onError = (error, stack) {
      crashlytics.recordError(error, stack, fatal: true);
      return true;
    };
  }

  await Analytics.instance.init();

  runApp(const SportifyApp());
}

class SportifyApp extends StatefulWidget {
  const SportifyApp({super.key});

  @override
  State<SportifyApp> createState() => _SportifyAppState();
}

class _SportifyAppState extends State<SportifyApp> {
  // Built once: the router listens to auth itself, and push / deep-link
  // handlers keep a reference to it.
  late final AuthProvider _auth = AuthProvider();
  late final GoRouter _router = buildRouter(_auth);

  @override
  void initState() {
    super.initState();
    PushService.instance.init(_router);
    DeepLinks.instance.init(_router);
  }

  @override
  Widget build(BuildContext context) => ChangeNotifierProvider.value(
    value: _auth,
    child: MaterialApp.router(
      title: 'Sportify',
      theme: appTheme,
      themeMode: ThemeMode.light,
      routerConfig: _router,
      scaffoldMessengerKey: rootMessengerKey,
      debugShowCheckedModeBanner: false,
    ),
  );
}
