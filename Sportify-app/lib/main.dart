import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:provider/provider.dart';
import 'core/router.dart';
import 'core/theme.dart';
import 'firebase_options.dart';
import 'providers/auth_provider.dart';

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

  runApp(const SportifyApp());
}

class SportifyApp extends StatelessWidget {
  const SportifyApp({super.key});

  @override
  Widget build(BuildContext context) => ChangeNotifierProvider(
    create: (_) => AuthProvider(),
    child: Builder(builder: (ctx) {
      final auth = ctx.watch<AuthProvider>();
      return MaterialApp.router(
        title: 'Sportify',
        theme: appTheme,
        themeMode: ThemeMode.light,
        routerConfig: buildRouter(auth),
        debugShowCheckedModeBanner: false,
      );
    }),
  );
}
