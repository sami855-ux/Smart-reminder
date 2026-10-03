import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';

import { cn } from '../../lib/cn';

export function AlertDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'default',
  loading = false,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'default' | 'destructive';
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={loading ? undefined : onCancel}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View className="flex-1 items-center justify-center px-6">
        <Pressable
          accessibilityLabel="Close confirmation dialog"
          className="absolute inset-0"
          disabled={loading}
          onPress={onCancel}
          style={{ backgroundColor: 'rgba(18, 21, 16, 0.48)' }}
        />
        <View
          accessibilityRole="alert"
          accessibilityViewIsModal
          className="w-full max-w-[360px] rounded-[22px] bg-paper p-5"
        >
          <Text className="font-inter-bold text-[20px] leading-7 text-foreground">{title}</Text>
          <Text className="mt-2 font-inter text-[14px] leading-6 text-muted-foreground">{message}</Text>
          <View className="mt-6 flex-row gap-2">
            <Pressable
              accessibilityRole="button"
              className="min-h-12 flex-1 items-center justify-center rounded-[14px] bg-secondary-fill px-3"
              disabled={loading}
              onPress={onCancel}
            >
              <Text className="font-inter-semibold text-[14px] text-foreground">{cancelLabel}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ busy: loading }}
              className={cn(
                'min-h-12 flex-1 items-center justify-center rounded-[14px] px-3',
                tone === 'destructive' ? 'bg-urgent' : 'bg-ink',
              )}
              disabled={loading}
              onPress={onConfirm}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text className="font-inter-semibold text-[14px] text-white">{confirmLabel}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
