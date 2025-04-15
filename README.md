# Interflow Mobile

Aplicativo móvel para acessar o Interflow através de um WebView otimizado.

## Repositório Git

Este projeto está disponível no GitHub:
```
git@github.com:rodrigooliver/interflow_mobile.git
```

Para instruções detalhadas sobre como contribuir para o projeto, consulte o arquivo [README_GIT.md](./README_GIT.md).

## Características

- WebView otimizado para uma experiência nativa
- Integração com OneSignal para notificações push
- Navegação entre páginas com suporte ao botão voltar
- Tela de splash personalizada
- Suporte para iOS e Android

## Requisitos

- Node.js 14 ou superior
- React Native CLI
- Xcode (para iOS)
- Android Studio (para Android)
- CocoaPods (para iOS)

## Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto com as seguintes variáveis:

```env
# Sentry Configuration
SENTRY_DSN=your_sentry_dsn
SENTRY_DISABLE_AUTO_UPLOAD=true
SENTRY_ALLOW_FAILURE=true

# OneSignal Configuration
ONESIGNAL_APP_ID=your_onesignal_app_id

# Base URL Configuration
BASE_URL=https://interflow.chat/app
```

## Instalação

1. Clone o repositório:
```bash
git clone git@github.com:rodrigooliver/interflow_mobile.git
cd Interflow_mobile
```

2. Instale as dependências:
```bash
npm install
```

3. Para iOS, instale os pods:
```bash
cd ios && pod install && cd ..
```

## Configuração do OneSignal

1. Crie uma conta no [OneSignal](https://onesignal.com/) se ainda não tiver uma.
2. Crie um novo aplicativo no OneSignal.
3. Substitua o valor de `ONESIGNAL_APP_ID` no arquivo `App.tsx` pelo seu App ID do OneSignal.

## Executando o aplicativo

### iOS

```bash
npx react-native run-ios
```

### Android

```bash
npx react-native run-android
```

## Personalização

### URL do WebView

Por padrão, o aplicativo carrega a URL `https://interflow.chat/app`. Para alterar, modifique a constante `BASE_URL` no arquivo `App.tsx`.

### Tela de Splash

Para personalizar a tela de splash:

1. Para Android, substitua os arquivos em `android/app/src/main/res/drawable`.
2. Para iOS, modifique o arquivo `LaunchScreen.storyboard` em `ios/Interflow_mobile`.

## Notificações Push

O aplicativo está configurado para receber notificações push através do OneSignal. Quando uma notificação contém um campo `url` nos dados adicionais, o aplicativo navegará para essa URL específica quando a notificação for clicada.

Exemplo de payload de notificação:

```json
{
  "contents": {
    "en": "Nova mensagem recebida"
  },
  "headings": {
    "en": "Interflow"
  },
  "data": {
    "url": "https://interflow.chat/app/chats/123"
  }
}
```

## Construindo para produção

### Android

```bash
cd android
./gradlew assembleRelease
```

O APK será gerado em `android/app/build/outputs/apk/release/app-release.apk`.

### iOS

Abra o projeto no Xcode e siga o processo padrão de arquivamento e distribuição.

## Documentação adicional

- [SETUP.md](./SETUP.md): Instruções detalhadas de configuração
- [RESUMO.md](./RESUMO.md): Resumo do projeto e próximos passos
- [README_GIT.md](./README_GIT.md): Instruções para contribuir com o projeto

## Licença

Este projeto está licenciado sob a licença MIT - veja o arquivo LICENSE para detalhes.
