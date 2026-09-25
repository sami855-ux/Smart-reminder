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
      style={{ top: insets.top + 12 }}
    >
      <View
        accessibilityLiveRegion="assertive"
        accessibilityRole="alert"
        className={cn(
          'w-full max-w-[520px] flex-row gap-3 self-center rounded-2xl border bg-paper p-4 shadow-lg',
          toast.tone === 'error' && 'border-urgent/30',
          toast.tone === 'success' && 'border-success/30',
          toast.tone === 'info' && 'border-intelligence/30',
        )}
      >
        <View
          className={cn(
            'mt-1 size-2.5 rounded-full',
            toast.tone === 'error' && 'bg-urgent',
            toast.tone === 'success' && 'bg-success',
            toast.tone === 'info' && 'bg-intelligence',
          )}
        />
        <View className="flex-1">
          <Text className="font-semibold text-[15px] leading-5 text-ink">
            {toast.title}
          </Text>
          {toast.message ? (
            <Text className="mt-1 font-normal text-[13px] leading-5 text-muted-ink">
              {toast.message}
            </Text>
          ) : null}
        </View>
        <Pressable
          accessibilityLabel="Dismiss message"
          accessibilityRole="button"
          className="size-10 items-center justify-center rounded-xl active:bg-canvas"
          hitSlop={4}
          onPress={dismissToast}
        >
          <Text className="font-normal text-xl leading-6 text-muted-ink">×</Text>
        </Pressable>
      </View>
    </View>
  );
}
