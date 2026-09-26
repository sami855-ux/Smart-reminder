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
  onBlur,
  onFocus,
  ...inputProps
}: TextFieldProps) {
  const [revealed, setRevealed] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputId = inputProps.nativeID ?? label.toLowerCase().replaceAll(' ', '-');

  return (
    <View>
      <Text
        className="mb-2 text-[13px] font-medium text-muted-ink"
        nativeID={`${inputId}-label`}
      >
        {label}
      </Text>
      <View
        className={cn(
          'min-h-[56px] flex-row items-center rounded-2xl border bg-paper px-4',
          error
            ? 'border-urgent'
            : focused
              ? 'border-ink'
              : 'border-taupe',
        )}
      >
        <TextInput
          {...inputProps}
          accessibilityLabelledBy={`${inputId}-label`}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className="min-h-[50px] flex-1 text-base font-normal text-ink"
          clearButtonMode={secureTextEntry ? 'never' : 'while-editing'}
          nativeID={inputId}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          placeholderTextColor="#85857E"
          secureTextEntry={secureTextEntry && !revealed}
          selectionColor="#343431"
        />
        {secureTextEntry ? (
          <Pressable
            accessibilityLabel={revealed ? `Hide ${label}` : `Show ${label}`}
            accessibilityRole="button"
            className="min-h-11 justify-center pl-3 active:opacity-70"
            onPress={() => setRevealed((current) => !current)}
          >
            <Text className="text-sm font-medium text-intelligence-dark">
              {revealed ? 'Hide' : 'Show'}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text
          accessibilityRole="alert"
          className="mt-1.5 text-[13px] font-normal leading-[18px] text-urgent"
          nativeID={`${inputId}-error`}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}
