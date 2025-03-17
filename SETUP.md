# Configuração Adicional do Interflow Mobile

Este documento contém instruções adicionais para configurar corretamente o aplicativo Interflow Mobile.

## Configuração do OneSignal

### Android

1. Crie um projeto no Firebase Console (https://console.firebase.google.com/)
2. Adicione um aplicativo Android com o pacote `com.interflow_mobile`
3. Baixe o arquivo `google-services.json` e coloque-o na pasta `android/app/`
4. No OneSignal, configure o Firebase Cloud Messaging com a chave do servidor do Firebase

### iOS

1. Crie um aplicativo no Apple Developer Portal
2. Configure o Push Notification no Capabilities
3. Gere um certificado de push notification
4. No OneSignal, configure o APNS com o certificado gerado
5. Baixe o arquivo `GoogleService-Info.plist` do Firebase e coloque-o na pasta `ios/Interflow_mobile/`

## Configuração do SplashScreen

### Android

1. Crie um ícone para o splash screen e salve-o como `splash_icon.png`
2. Coloque o arquivo nas pastas de drawable com diferentes resoluções:
   - `android/app/src/main/res/drawable-mdpi/`
   - `android/app/src/main/res/drawable-hdpi/`
   - `android/app/src/main/res/drawable-xhdpi/`
   - `android/app/src/main/res/drawable-xxhdpi/`
   - `android/app/src/main/res/drawable-xxxhdpi/`

### iOS

1. Adicione a imagem `SplashIcon.png` ao Assets.xcassets no Xcode
2. Certifique-se de que a imagem está disponível em diferentes resoluções (1x, 2x, 3x)

## Configuração do AndroidManifest.xml

Adicione as seguintes permissões e configurações ao arquivo `android/app/src/main/AndroidManifest.xml`:

```xml
<manifest ...>
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.VIBRATE" />
    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED"/>

    <application ...>
        <!-- Configuração do SplashScreen -->
        <activity
            android:name=".SplashActivity"
            android:theme="@style/SplashTheme"
            android:label="@string/app_name"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <!-- Atividade principal -->
        <activity
            android:name=".MainActivity"
            android:label="@string/app_name"
            android:configChanges="keyboard|keyboardHidden|orientation|screenSize|uiMode"
            android:launchMode="singleTask"
            android:windowSoftInputMode="adjustResize"
            android:exported="true">
        </activity>
        
        <!-- Configurações do OneSignal -->
        <meta-data
            android:name="com.onesignal.NotificationOpened.DEFAULT"
            android:value="DISABLE" />
    </application>
</manifest>
```

## Configuração do styles.xml

Crie ou modifique o arquivo `android/app/src/main/res/values/styles.xml`:

```xml
<resources>
    <!-- Base application theme -->
    <style name="AppTheme" parent="Theme.AppCompat.DayNight.NoActionBar">
        <item name="android:statusBarColor">@color/status_bar_color</item>
    </style>

    <!-- Splash screen theme -->
    <style name="SplashTheme" parent="Theme.AppCompat.Light.NoActionBar">
        <item name="android:windowBackground">@layout/launch_screen</item>
        <item name="android:statusBarColor">@color/status_bar_color</item>
    </style>
</resources>
```

## Configuração do Info.plist (iOS)

Adicione as seguintes configurações ao arquivo `ios/Interflow_mobile/Info.plist`:

```xml
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoads</key>
    <true/>
</dict>
<key>UIBackgroundModes</key>
<array>
    <string>remote-notification</string>
</array>
<key>UIViewControllerBasedStatusBarAppearance</key>
<false/>
```

## Inicialização do SplashScreen

No arquivo `index.js`, importe e inicialize o SplashScreen:

```javascript
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import SplashScreen from 'react-native-splash-screen';

// Registrar o componente principal
AppRegistry.registerComponent(appName, () => App);
```

## Considerações Finais

- Certifique-se de substituir o valor de `ONESIGNAL_APP_ID` no arquivo `App.tsx` pelo seu App ID do OneSignal
- Para iOS, execute `pod install` na pasta `ios` após qualquer alteração nas dependências
- Para Android, pode ser necessário limpar o cache do Gradle com `cd android && ./gradlew clean` 