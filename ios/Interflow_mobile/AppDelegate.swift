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

    let result = super.application(application, didFinishLaunchingWithOptions: launchOptions)

    if let rootView = self.window.rootViewController?.view {
      rootView.backgroundColor = Self.bootBg
    }
    self.window.backgroundColor = Self.bootBg

    RNSplashScreen.show()

    return result
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
