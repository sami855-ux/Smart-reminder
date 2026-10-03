import { useState } from 'react';
import {
  Pressable,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';

import { cn } from '../../lib/cn';
import { useAppTheme } from '../../theme/theme-context';
import { AuthIcon, type AuthIconName } from './AuthIcon';

type TextFieldProps = TextInputProps & {
  label: string;
  error?: string;
  tone?: 'light' | 'auth';
  icon?: AuthIconName;
};

export function TextField({
  label,
  error,
  tone = 'light',
  icon,
  secureTextEntry = false,
  onBlur,
  onFocus,
  ...inputProps
}: TextFieldProps) {
  const { colors } = useAppTheme();
  const [revealed, setRevealed] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputId = inputProps.nativeID ?? label.toLowerCase().replaceAll(' ', '-');
  const isAuth = tone === 'auth';

  return (
    <View>
      <Text
        className={cn(
          'mb-2.5 text-[13px]',
          isAuth
            ? 'font-inter-medium text-auth-muted'
            : 'font-inter-medium text-muted-foreground',
        )}
        nativeID={`${inputId}-label`}
      >
        {label}
      </Text>
      <View
        className={cn(
          'min-h-[56px] flex-row items-center rounded-[14px] border bg-paper px-4',
          isAuth && 'rounded-[14px] bg-auth-surface',
          error
            ? 'border-urgent'
            : focused
              ? isAuth
                ? 'border-auth-accent'
                : 'border-ink'
              : isAuth
                ? 'border-auth-line'
                : 'border-taupe',
        )}
      >
        {isAuth && icon ? (
          <View className="mr-3">
            <AuthIcon
              color={error ? '#B94A42' : focused ? colors.accent : colors.muted}
              name={icon}
              size={20}
            />
          </View>
        ) : null}
        <TextInput
          {...inputProps}
          accessibilityLabelledBy={`${inputId}-label`}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className={cn(
            'min-h-[52px] flex-1 text-base',
            isAuth
              ? 'font-inter text-auth-ink'
              : 'font-inter text-foreground',
          )}
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
          placeholderTextColor={colors.muted}
          secureTextEntry={secureTextEntry && !revealed}
          selectionColor={colors.accent}
        />
        {secureTextEntry ? (
          <Pressable
            accessibilityLabel={revealed ? `Hide ${label}` : `Show ${label}`}
            accessibilityRole="button"
            className={cn(
              'min-h-11 justify-center pl-3 active:opacity-70',
              isAuth && 'border-l border-auth-line',
            )}
            onPress={() => setRevealed((current) => !current)}
          >
            {isAuth ? (
              <AuthIcon
                color={colors.accent}
                name={revealed ? 'eye-off' : 'eye'}
                size={21}
              />
            ) : (
              <Text className="text-sm font-inter-medium text-accent">
                {revealed ? 'Hide' : 'Show'}
              </Text>
            )}
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text
          accessibilityRole="alert"
          className={cn(
            'mt-1.5 text-[13px] leading-[18px]',
            isAuth ? 'font-inter text-urgent' : 'font-inter text-urgent',
          )}
          nativeID={`${inputId}-error`}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}
