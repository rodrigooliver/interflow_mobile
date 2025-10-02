package com.interflow_mobile

import android.os.Build
import android.os.Bundle
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

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
   * Habilita o modo Edge-to-Edge para compatibilidade com Android 15 (SDK 35+)
   * Usa APIs modernas que não estão descontinuadas
   */
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    
    // Habilita edge-to-edge para compatibilidade com Android 15+
    WindowCompat.setDecorFitsSystemWindows(window, false)
    
    // Configura as barras do sistema usando WindowInsetsController (API moderna)
    val windowInsetsController = WindowCompat.getInsetsController(window, window.decorView)
    windowInsetsController?.apply {
      // Define o comportamento das barras do sistema
      systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_DEFAULT
      
      // Torna as barras transparentes sem usar APIs descontinuadas
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        window.isNavigationBarContrastEnforced = false
        window.isStatusBarContrastEnforced = false
      }
    }
  }
}
