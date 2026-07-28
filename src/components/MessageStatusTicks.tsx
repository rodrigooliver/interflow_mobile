import React from 'react';
import {View, StyleSheet} from 'react-native';
import {Check, CheckCheck, Clock, CircleAlert} from 'lucide-react-native';
import {brand} from '../theme/tokens';
import {normalizeDeliveryStatus} from '../utils/chatListDisplay';

type Props = {
  status?: string | null;
  mutedColor?: string;
  /** Em bolha azul: checks claros; lido em tom mais forte */
  readColor?: string;
  size?: number;
};

/**
 * Status de entrega com Lucide — alinhado ao MessageStatus da web:
 * Clock / Check / CheckCheck / CircleAlert.
 */
export function MessageStatusTicks({
  status,
  mutedColor = '#8E8E93',
  readColor = brand.blue,
  size = 14,
}: Props) {
  const normalized = normalizeDeliveryStatus(status);

  if (normalized === 'pending') {
    return (
      <View style={styles.wrap}>
        <Clock size={size} color={mutedColor} strokeWidth={2.2} />
      </View>
    );
  }

  if (normalized === 'failed') {
    return (
      <View style={styles.wrap}>
        <CircleAlert size={size} color="#EF4444" strokeWidth={2.2} />
      </View>
    );
  }

  if (normalized === 'sent') {
    return (
      <View style={styles.wrap}>
        <Check size={size} color={mutedColor} strokeWidth={2.4} />
      </View>
    );
  }

  const color = normalized === 'read' ? readColor : mutedColor;

  return (
    <View style={styles.wrap}>
      <CheckCheck size={size} color={color} strokeWidth={2.4} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginRight: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
