import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@main
class AppDelegate: RCTAppDelegate {
  override func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey : Any]? = nil) -> Bool {
    self.moduleName = "Interflow_mobile"
    self.dependencyProvider = RCTAppDependencyProvider()

    // You can add your custom initial props in the dictionary below.
    // They will be passed down to the ViewController used by React Native.
    self.initialProps = [:]

    let result = super.application(application, didFinishLaunchingWithOptions: launchOptions)
    
    // Definir cor de fundo para evitar flash branco entre splash e React Native
    // Cor #1E2B3D em RGB
    if let rootView = self.window.rootViewController?.view {
      rootView.backgroundColor = UIColor(red: 30/255, green: 43/255, blue: 61/255, alpha: 1.0)
    }
    self.window.backgroundColor = UIColor(red: 30/255, green: 43/255, blue: 61/255, alpha: 1.0)
    
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
