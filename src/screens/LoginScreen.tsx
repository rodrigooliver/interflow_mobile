import React, {useRef, useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
  Alert,
} from 'react-native';
import {useAuth} from '../contexts/AuthContext';
import {useTheme} from '../contexts/ThemeContext';
import {colors, radii, spacing} from '../theme/tokens';
import {
  cycleChatUiMode,
  resolveChatUiMode,
  setChatUiModeOverride,
} from '../config/chatUiMode';
import type {ChatUIMode} from '../config/env';
import SplashLogo from '../assets/splash_logo.png';

interface LoginScreenProps {
  onModeChanged?: (mode: ChatUIMode) => void;
}

export function LoginScreen({onModeChanged}: LoginScreenProps) {
  const {signIn} = useAuth();
  const {colors: theme} = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      const {error: signInError} = await signIn(email.trim(), password);
      if (signInError) {
        setError(
          signInError.message === 'Invalid login credentials'
            ? 'Credenciais inválidas'
            : 'Não foi possível entrar. Tente novamente.',
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogoTap = async () => {
    tapCountRef.current += 1;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    tapTimerRef.current = setTimeout(() => {
      tapCountRef.current = 0;
    }, 2000);

    if (tapCountRef.current < 7) return;
    tapCountRef.current = 0;
    const current = await resolveChatUiMode();
    const next = cycleChatUiMode(current);
    await setChatUiModeOverride(next);
    onModeChanged?.(next);
    Alert.alert(
      'Modo da UI',
      `CHAT_UI_MODE alterado para "${next}". Reinicie o app se a navegação não atualizar.`,
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, {backgroundColor: theme.pageBg}]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.card, {backgroundColor: theme.card, borderColor: theme.border}]}>
        <TouchableOpacity onPress={handleLogoTap} activeOpacity={0.8}>
          <Image source={SplashLogo} style={styles.logo} resizeMode="contain" />
        </TouchableOpacity>
        <Text style={[styles.title, {color: theme.text}]}>Interflow</Text>
        <Text style={[styles.subtitle, {color: theme.textSecondary}]}>
          Entre para continuar
        </Text>

        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: theme.inputBg,
              borderColor: theme.border,
              color: theme.text,
            },
          ]}
          placeholder="E-mail"
          placeholderTextColor={theme.textMuted}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          value={email}
          onChangeText={setEmail}
        />
        <View style={styles.passwordRow}>
          <TextInput
            style={[
              styles.input,
              styles.passwordInput,
              {
                backgroundColor: theme.inputBg,
                borderColor: theme.border,
                color: theme.text,
              },
            ]}
            placeholder="Senha"
            placeholderTextColor={theme.textMuted}
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={setPassword}
          />
          <TouchableOpacity
            style={styles.showBtn}
            onPress={() => setShowPassword(v => !v)}>
            <Text style={{color: colors.primary}}>{showPassword ? 'Ocultar' : 'Mostrar'}</Text>
          </TouchableOpacity>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading || !email || !password}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Entrar</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.xl,
  },
  logo: {
    width: 72,
    height: 72,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  input: {
    borderWidth: 1,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: Platform.OS === 'ios' ? 14 : 12,
    fontSize: 16,
    marginBottom: spacing.md,
  },
  passwordRow: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 88,
  },
  showBtn: {
    position: 'absolute',
    right: spacing.md,
    top: 14,
  },
  error: {
    color: colors.danger,
    marginBottom: spacing.md,
    fontSize: 14,
  },
  button: {
    backgroundColor: colors.primaryStrong,
    borderRadius: radii.lg,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
