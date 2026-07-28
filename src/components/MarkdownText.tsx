import React, {useMemo} from 'react';
import {StyleSheet, View, type StyleProp, type TextStyle} from 'react-native';
import Markdown from 'react-native-markdown-display';
import {brand, typography} from '../theme/tokens';

type MarkdownTextProps = {
  content: string;
  color: string;
  style?: StyleProp<TextStyle>;
  /** Links em bolha outgoing: branco/claro; incoming: azul */
  linkColor?: string;
  /** Preview da lista: uma linha, sem blocos */
  variant?: 'default' | 'compact';
};

function preprocess(content: string, compact: boolean): string {
  let next = content.replace(/<[^>]*>/g, '');

  if (compact) {
    next = next.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  next = next.replace(/\[(https?:\/\/[^\]]+)\](?!\()/g, (_m, url: string) => {
    const label = url.length > 48 ? `${url.slice(0, 45)}...` : url;
    return `[${label}](${url})`;
  });

  const existing: Array<{start: number; end: number}> = [];
  const linkRe = /\[[^\]]*\]\([^)]+\)/g;
  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(next)) !== null) {
    existing.push({start: match.index, end: match.index + match[0].length});
  }

  next = next.replace(/https?:\/\/[^\s)]+/g, (url, offset: number) => {
    const inside = existing.some(r => offset >= r.start && offset < r.end);
    if (inside) return url;
    const label = url.length > 48 ? `${url.slice(0, 45)}...` : url;
    return `[${label}](${url})`;
  });

  return compact ? next : next.replace(/\n{3,}/g, '\n\n').trim();
}

export function MarkdownText({
  content,
  color,
  style,
  linkColor = brand.blue,
  variant = 'default',
}: MarkdownTextProps) {
  const compact = variant === 'compact';
  const body = useMemo(
    () => preprocess(content || '', compact),
    [content, compact],
  );

  const fontSize = compact ? typography.subhead : typography.body;
  const lineHeight = compact ? 18 : 22;

  const mdStyles = useMemo(
    () =>
      StyleSheet.create({
        body: {
          color,
          fontSize,
          lineHeight,
          ...(StyleSheet.flatten(style) || {}),
        },
        paragraph: {
          marginTop: 0,
          marginBottom: compact ? 0 : 4,
          color,
          fontSize,
          lineHeight,
        },
        text: {color},
        strong: {fontWeight: '700', color},
        em: {fontStyle: 'italic', color},
        s: {textDecorationLine: 'line-through', color},
        link: {
          color: linkColor,
          textDecorationLine: compact ? 'none' : 'underline',
        },
        code_inline: {
          fontFamily: 'Menlo',
          fontSize: compact ? 12 : 14,
          color,
          backgroundColor: compact ? 'transparent' : 'rgba(127,127,127,0.2)',
        },
        fence: {
          fontFamily: 'Menlo',
          fontSize: 13,
          color,
          backgroundColor: 'rgba(127,127,127,0.2)',
          borderRadius: 8,
          padding: 8,
          marginVertical: 4,
        },
        bullet_list: {marginVertical: 0},
        ordered_list: {marginVertical: 0},
        list_item: {
          color,
          fontSize,
          lineHeight,
          marginVertical: 0,
        },
        heading1: {color, fontSize, fontWeight: '700', marginBottom: 0},
        heading2: {color, fontSize, fontWeight: '700', marginBottom: 0},
        heading3: {color, fontSize, fontWeight: '700', marginBottom: 0},
      }),
    [color, linkColor, style, fontSize, lineHeight, compact],
  );

  if (!body) return null;

  const markdown = (
    <Markdown style={mdStyles} mergeStyle>
      {body}
    </Markdown>
  );

  if (compact) {
    return <View style={styles.compactClip}>{markdown}</View>;
  }

  return markdown;
}

const styles = StyleSheet.create({
  compactClip: {
    flex: 1,
    maxHeight: 20,
    overflow: 'hidden',
  },
});
