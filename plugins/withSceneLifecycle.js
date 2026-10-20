// Apps built with the iOS 27 SDK (Xcode 27+) are killed on launch unless they
// adopt the UIScene life cycle ("UIScene life cycle is required for apps built
// with this SDK"). Expo SDK 54's AppDelegate template still creates its window
// in didFinishLaunching, so this plugin moves window creation into a
// SceneDelegate and declares the scene manifest in Info.plist.
const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

const WINDOW_SETUP = `#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif
`;

const SCENE_DELEGATE = `
// Added by plugins/withSceneLifecycle.js
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  private var appDelegate: AppDelegate? { UIApplication.shared.delegate as? AppDelegate }

  func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
    guard let windowScene = scene as? UIWindowScene, let appDelegate = appDelegate else { return }
    let window = UIWindow(windowScene: windowScene)
    self.window = window
    appDelegate.window = window
    // With scenes, a cold-start deep link arrives here instead of in launchOptions. Forward it
    // through open-url too: expo-linking (and so expo-router) only learns the initial URL there.
    var launchOptions = appDelegate.launchOptions ?? [:]
    if let url = connectionOptions.urlContexts.first?.url {
      launchOptions[.url] = url
      _ = appDelegate.application(UIApplication.shared, open: url, options: [:])
    }
    appDelegate.reactNativeFactory?.startReactNative(withModuleName: "main", in: window, launchOptions: launchOptions)
    if let userActivity = connectionOptions.userActivities.first {
      _ = appDelegate.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
    }
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    for context in URLContexts {
      _ = appDelegate?.application(UIApplication.shared, open: context.url, options: [:])
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    _ = appDelegate?.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
  }
}
`;

function withSceneAppDelegate(config) {
  return withAppDelegate(config, (config) => {
    let src = config.modResults.contents;
    if (src.includes('class SceneDelegate')) return config;
    if (config.modResults.language !== 'swift' || !src.includes(WINDOW_SETUP)) {
      throw new Error('withSceneLifecycle: AppDelegate.swift does not match the Expo SDK 54 template; update the plugin.');
    }
    src = src.replace(
      'var reactNativeFactory: RCTReactNativeFactory?\n',
      'var reactNativeFactory: RCTReactNativeFactory?\n  var launchOptions: [UIApplication.LaunchOptionsKey: Any]?\n'
    );
    src = src.replace(WINDOW_SETUP, '    self.launchOptions = launchOptions\n');
    config.modResults.contents = src + SCENE_DELEGATE;
    return config;
  });
}

function withSceneManifest(config) {
  return withInfoPlist(config, (config) => {
    config.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    };
    return config;
  });
}

module.exports = function withSceneLifecycle(config) {
  return withSceneManifest(withSceneAppDelegate(config));
};
