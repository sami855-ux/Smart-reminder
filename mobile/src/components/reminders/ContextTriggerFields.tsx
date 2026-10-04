import { Pressable, Text, View } from 'react-native';

import { cn } from '../../lib/cn';
import { TextField } from '../ui/TextField';

export type ContextTriggerDraft = {
  id: string;
  type: 'LOCATION_ARRIVE' | 'LOCATION_LEAVE' | 'WIFI_CONNECT';
  label: string;
  networkName: string;
  radius: string;
  latitude?: number;
  longitude?: number;
};

export function ContextTriggerFields({
  draft,
  capturingLocation = false,
  onCaptureLocation,
  onChange,
  onRemove,
}: {
  draft: ContextTriggerDraft;
  capturingLocation?: boolean;
  onCaptureLocation: () => void;
  onChange: (next: ContextTriggerDraft) => void;
  onRemove?: () => void;
}) {
  const locationSelected = draft.type !== 'WIFI_CONNECT';

  return (
    <View className="gap-4 border-t border-secondary-fill pt-4">
      <View className="flex-row items-center justify-between">
        <Text className="font-inter-semibold text-[14px] text-foreground">Trigger</Text>
        {onRemove ? (
          <Pressable
            accessibilityLabel="Remove context trigger"
            accessibilityRole="button"
            className="min-h-11 justify-center px-2"
            onPress={onRemove}
          >
            <Text className="font-inter-semibold text-[13px] text-urgent">Remove</Text>
          </Pressable>
        ) : null}
      </View>

      <View accessibilityRole="radiogroup" className="flex-row rounded-[14px] bg-secondary-fill p-1">
        {([
          ['LOCATION_ARRIVE', 'Arrive'],
          ['LOCATION_LEAVE', 'Leave'],
          ['WIFI_CONNECT', 'Wi-Fi'],
        ] as const).map(([value, label]) => (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: draft.type === value }}
            className={cn(
              'min-h-11 flex-1 items-center justify-center rounded-[11px]',
              draft.type === value && 'bg-white',
            )}
            key={value}
            onPress={() => onChange({ ...draft, type: value })}
          >
            <Text
              className={cn(
                'font-inter-semibold text-[13px] text-muted-foreground',
                draft.type === value && 'text-foreground',
              )}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      <TextField
        label="Private label"
        maxLength={120}
        onChangeText={(label) => onChange({ ...draft, label })}
        placeholder="Home or office"
        value={draft.label}
      />

      {draft.type === 'WIFI_CONNECT' ? (
        <>
          <TextField
            autoCapitalize="none"
            autoCorrect={false}
            label="Exact Wi-Fi network name"
            maxLength={128}
            onChangeText={(networkName) => onChange({ ...draft, networkName })}
            placeholder="Office Wi-Fi"
            value={draft.networkName}
          />
          <Text className="font-inter text-[12px] leading-5 text-muted-foreground">
            Enter the SSID exactly, including spaces and capitalization. The server stores only a keyed fingerprint.
          </Text>
        </>
      ) : (
        <>
          <TextField
            keyboardType="number-pad"
            label="Radius · meters"
            maxLength={4}
            onChangeText={(radius) => onChange({ ...draft, radius: radius.replace(/\D/gu, '') })}
            value={draft.radius}
          />
          <Pressable
            accessibilityRole="button"
            className="min-h-12 flex-row items-center justify-between border-y border-taupe py-3 active:opacity-60"
            disabled={capturingLocation}
            onPress={onCaptureLocation}
          >
            <View className="flex-1 pr-4">
              <Text className="font-inter-semibold text-[14px] text-intelligence">
                {capturingLocation ? 'Getting location…' : 'Use current location'}
              </Text>
              <Text className="mt-1 font-inter text-[12px] leading-5 text-muted-foreground">
                {draft.latitude !== undefined && draft.longitude !== undefined
                  ? `Captured · ${draft.latitude.toFixed(4)}, ${draft.longitude.toFixed(4)}`
                  : 'Required for arrival and departure triggers.'}
              </Text>
            </View>
            <View
              className={cn(
                'size-3 rounded-full',
                draft.latitude !== undefined && draft.longitude !== undefined
                  ? 'bg-success'
                  : 'bg-taupe',
              )}
            />
          </Pressable>
          {locationSelected ? (
            <Text className="font-inter text-[12px] leading-5 text-muted-foreground">
              Location is encrypted before storage. Background access is required for geofencing.
            </Text>
          ) : null}
        </>
      )}
    </View>
  );
}
