import { Pressable, Text } from 'react-native';

type TextLinkProps = {
  label: string;
  onPress: () => void;
  accessibilityHint?: string;
  tone?: 'light' | 'auth';
};

export function TextLink({
  label,
  onPress,
  accessibilityHint,
  tone = 'light',
}: TextLinkProps) {
  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityRole="link"
      className="min-h-11 justify-center self-start active:opacity-70"
      onPress={onPress}
    >
      <Text
        className={
          tone === 'auth'
            ? 'font-inter-medium text-[14px] text-auth-accent'
            : 'text-[15px] font-medium text-accent'
        }
      >
        {label}
      </Text>
    </Pressable>
  );
}
