import { useState } from 'react';
import {
  Pressable,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';

import { cn } from '../../lib/cn';

type TextFieldProps = TextInputProps & {
  label: string;
  error?: string;
};

export function TextField({
  label,
  error,
  secureTextEntry = false,
  ...inputProps
}: TextFieldProps) {
  const [revealed, setRevealed] = useState(false);
  const inputId = inputProps.nativeID ?? label.toLowerCase().replaceAll(' ', '-');

  return (
    <View>
      <Text
        className="mb-2 font-inter-medium text-[13px] text-ink"
        nativeID={`${inputId}-label`}
      >
        {label}
      </Text>
      <View
        className={cn(
          'min-h-[54px] flex-row items-center rounded-xl border bg-paper px-4',
          error ? 'border-urgent' : 'border-taupe/60',
        )}
      >
        <TextInput
          {...inputProps}
          accessibilityLabelledBy={`${inputId}-label`}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className="min-h-[52px] flex-1 font-inter text-[15px] text-ink"
          nativeID={inputId}
          placeholderTextColor="#B8B4AA"
          secureTextEntry={secureTextEntry && !revealed}
          selectionColor="#1C1D21"
        />
        {secureTextEntry ? (
          <Pressable
            accessibilityLabel={revealed ? `Hide ${label}` : `Show ${label}`}
            accessibilityRole="button"
            className="min-h-11 justify-center pl-3 active:opacity-70"
            onPress={() => setRevealed((current) => !current)}
          >
            <Text className="font-inter-medium text-[13px] text-muted-ink">
              {revealed ? 'Hide' : 'Show'}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text
          accessibilityRole="alert"
          className="mt-1.5 font-inter text-[13px] leading-[18px] text-urgent"
          nativeID={`${inputId}-error`}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}
