import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';

import { cn } from '../../lib/cn';

type ToastTone = 'error' | 'success' | 'info';

type ToastInput = {
  title: string;
  message?: string;
  tone?: ToastTone;
  duration?: number;
};

type ToastState = ToastInput & {
  id: number;
  tone: ToastTone;
};

type ToastContextValue = {
  showToast: (toast: ToastInput) => void;
  dismissToast: () => void;
  toast: ToastState | null;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: PropsWithChildren) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const nextId = useRef(0);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissToast = useCallback(() => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = null;
    setToast(null);
  }, []);

  const showToast = useCallback((input: ToastInput) => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);

    nextId.current += 1;
    setToast({ ...input, id: nextId.current, tone: input.tone ?? 'info' });
    dismissTimer.current = setTimeout(
      () => {
        dismissTimer.current = null;
        setToast(null);
      },
      input.duration ?? 5000,
    );
  }, []);

  useEffect(
    () => () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    },
    [],
  );

  const value = useMemo(
    () => ({ showToast, dismissToast, toast }),
    [dismissToast, showToast, toast],
  );

  return (
    <ToastContext.Provider value={value}>
      <View className="flex-1">
        {children}
        <ToastViewport />
      </View>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used inside ToastProvider');
  return value;
}

export function ToastViewport() {
  const insets = useSafeAreaInsets();
  const { dismissToast, toast } = useToast();

  if (!toast) return null;

  return (
    <View
      className="absolute left-4 right-4 z-50"
      pointerEvents="box-none"
      style={{ bottom: insets.bottom + 16 }}
    >
      <Animated.View
        key={toast.id}
        accessibilityLiveRegion="assertive"
        accessibilityRole="alert"
        className="w-full max-w-[360px] self-center"
        entering={FadeInDown.duration(180)}
        exiting={FadeOutDown.duration(140)}
      >
        <Pressable
          accessibilityLabel={`${toast.title}${toast.message ? `. ${toast.message}` : ''}. Tap to dismiss.`}
          accessibilityRole="button"
          className="min-h-12 flex-row items-center rounded-[16px] bg-ink px-4 py-3"
          onPress={dismissToast}
        >
          <View
            className={cn(
              'mr-3 size-2 rounded-full',
              toast.tone === 'error' && 'bg-urgent',
              toast.tone === 'success' && 'bg-kast-lime',
              toast.tone === 'info' && 'bg-white',
            )}
          />
          <Text className="flex-1 font-inter text-[13px] leading-5 text-white" numberOfLines={3}>
            <Text className="font-inter-semibold">{toast.title}</Text>
            {toast.message ? `  ${toast.message}` : ''}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}
