import { Pressable, Text } from 'react-native';

type TextLinkProps = {
  label: string;
  onPress: () => void;
  accessibilityHint?: string;
};

export function TextLink({ label, onPress, accessibilityHint }: TextLinkProps) {
  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityRole="link"
      className="min-h-11 justify-center self-start active:opacity-70"
      onPress={onPress}
    >
      <Text className="text-[15px] font-medium text-intelligence">
        {label}
      </Text>
    </Pressable>
  );
}
