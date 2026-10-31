// Generated from project: sportify-26d24
// Run `flutterfire configure` to regenerate platform-specific app IDs
// when you register Android/iOS apps in the Firebase console.

import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;

class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) return web;
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      case TargetPlatform.iOS:
        return ios;
      default:
        throw UnsupportedError(
          'DefaultFirebaseOptions not configured for this platform.',
        );
    }
  }

  static const FirebaseOptions web = FirebaseOptions(
    apiKey: 'AIzaSyC51ntAqedRqkpwBhOpw1YuCnKzHp3krHI',
    appId: '1:550504812729:web:43bae6d0336dcccc2a0b68',
    messagingSenderId: '550504812729',
    projectId: 'sportify-26d24',
    authDomain: 'sportify-26d24.firebaseapp.com',
    storageBucket: 'sportify-26d24.firebasestorage.app',
    measurementId: 'G-CF99WT7DLN',
  );

  // For Android/iOS: register your app in Firebase console
  // (Project settings → Add app → Android/iOS) to get the
  // platform-specific appId, then replace the value below.
  // Until then, these use the same credentials as the web app.
  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'AIzaSyC51ntAqedRqkpwBhOpw1YuCnKzHp3krHI',
    appId: '1:550504812729:web:43bae6d0336dcccc2a0b68',
    messagingSenderId: '550504812729',
    projectId: 'sportify-26d24',
    storageBucket: 'sportify-26d24.firebasestorage.app',
  );

  static const FirebaseOptions ios = FirebaseOptions(
    apiKey: 'AIzaSyC51ntAqedRqkpwBhOpw1YuCnKzHp3krHI',
    appId: '1:550504812729:web:43bae6d0336dcccc2a0b68',
    messagingSenderId: '550504812729',
    projectId: 'sportify-26d24',
    storageBucket: 'sportify-26d24.firebasestorage.app',
    iosBundleId: 'com.avartanlabs.sportifyApp',
  );
}
