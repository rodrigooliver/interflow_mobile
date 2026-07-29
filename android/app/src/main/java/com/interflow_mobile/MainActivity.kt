package com.interflow_mobile

import android.os.Build
import android.os.Bundle
import androidx.core.view.WindowCompat
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import org.devio.rn.splashscreen.SplashScreen

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "Interflow_mobile"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  /**
   * Configura a aparência das barras do sistema
   */
  override fun onCreate(savedInstanceState: Bundle?) {
    // Splash com logo (launch_screen.xml) até o LoadingScreen JS assumir
    SplashScreen.show(this)
    super.onCreate(savedInstanceState)

    // Mantém o comportamento padrão onde o conteúdo não vai por baixo das barras
    WindowCompat.setDecorFitsSystemWindows(window, true)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      window.navigationBarColor = android.graphics.Color.parseColor("#030712")
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
      window.statusBarColor = android.graphics.Color.parseColor("#030712")
    }
  }
}
