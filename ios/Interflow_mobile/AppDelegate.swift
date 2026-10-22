import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@main
class AppDelegate: RCTAppDelegate {
  // #030712 — loading sempre escuro
  private static let bootBg = UIColor(red: 3/255, green: 7/255, blue: 18/255, alpha: 1.0)

  override func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey : Any]? = nil) -> Bool {
    self.moduleName = "Interflow_mobile"
    self.dependencyProvider = RCTAppDependencyProvider()
    self.initialProps = [:]
    // iOS 26+/27 exige UIScene; a window é criada em scene(_:willConnectTo:)
    self.automaticallyLoadReactNativeWindow = false

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  override func application(
    _ application: UIApplication,
    configurationForConnecting connectingSceneSession: UISceneSession,
    options: UIScene.ConnectionOptions
  ) -> UISceneConfiguration {
    let config = UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
    config.delegateClass = AppDelegate.self
    return config
  }

  override func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
    guard let windowScene = scene as? UIWindowScene else { return }

    let rootView = self.rootViewFactory().view(
      withModuleName: self.moduleName ?? "Interflow_mobile",
      initialProperties: self.initialProps,
      launchOptions: nil
    )
    rootView.backgroundColor = Self.bootBg

    let rootViewController = self.createRootViewController()
    self.setRootView(rootView, toRootViewController: rootViewController)

    let window = UIWindow(windowScene: windowScene)
    window.backgroundColor = Self.bootBg
    window.rootViewController = rootViewController
    window.makeKeyAndVisible()
    self.window = window

    RNSplashScreen.show()
  }

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
