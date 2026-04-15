import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'cc.wu.fansxingju',
  appName: '粉丝星聚',
  webDir: 'out',

  // ---------------------------------------------------------------------------
  // Android configuration
  // ---------------------------------------------------------------------------
  android: {
    // Allow mixed content (HTTP inside HTTPS WebView) for local dev
    allowMixedContent: true,
    // Use Chrome Custom Tabs for external links
    useLegacyBridge: false,
    // Background color matching dark theme
    backgroundColor: '#0f0f0f',
    // Build flavor — can be overridden for TV builds
    // flavor: 'mobile',
  },

  // ---------------------------------------------------------------------------
  // iOS configuration
  // ---------------------------------------------------------------------------
  // NOTE: iOS builds require Xcode on macOS.
  // - Bundle ID: cc.wu.fansxingju (same as appId)
  // - Deployment target: iOS 14+
  // - Required capabilities: Background Audio, Push Notifications
  // - Privacy descriptions must be added to Info.plist:
  //     NSMicrophoneUsageDescription — 语音搜索
  //     NSPhotoLibraryUsageDescription — 上传图片
  //     NSCameraUsageDescription — 视频验证
  // - App Transport Security: allow Cloudflare domains
  ios: {
    // Use WKWebView (default in Capacitor 5+)
    contentInset: 'automatic',
    backgroundColor: '#0f0f0f',
    // Prefer status bar style for dark theme
    preferredContentMode: 'mobile',
  },

  // ---------------------------------------------------------------------------
  // Server / dev configuration
  // ---------------------------------------------------------------------------
  server: {
    // In production, content is served from the local webDir.
    // For development, uncomment the url below:
    // url: 'http://192.168.1.x:3000',
    cleartext: false,
    androidScheme: 'https',
  },

  // ---------------------------------------------------------------------------
  // Plugins
  // ---------------------------------------------------------------------------
  plugins: {
    // Push Notifications (Android FCM + iOS APNs)
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    // Splash Screen
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#0f0f0f',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
    },
    // Status Bar
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0f0f0f',
    },
    // Keyboard (mobile)
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
    // Local Notifications
    LocalNotifications: {
      smallIcon: 'ic_stat_icon',
      iconColor: '#3ea6ff',
    },
  },
};

// ---------------------------------------------------------------------------
// Android TV notes
// ---------------------------------------------------------------------------
// To build for Android TV:
// 1. In android/app/src/main/AndroidManifest.xml, add:
//    <uses-feature android:name="android.software.leanback" android:required="false" />
//    <uses-feature android:name="android.hardware.touchscreen" android:required="false" />
//
// 2. Add a Leanback launcher activity or intent-filter:
//    <category android:name="android.intent.category.LEANBACK_LAUNCHER" />
//
// 3. Provide a TV banner (320x180) in android/app/src/main/res/drawable/
//    and reference it in the manifest: android:banner="@drawable/tv_banner"
//
// 4. The app detects TV at runtime via src/lib/platform/detect.ts
//    and renders the TV-specific UI (FocusNavigation + TVLayout + ElderMode).
//
// 5. Ensure APK size ≤ 30MB by excluding unused assets.
// ---------------------------------------------------------------------------

export default config;
