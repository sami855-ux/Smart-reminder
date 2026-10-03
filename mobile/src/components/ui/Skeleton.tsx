import { View } from 'react-native';

import { cn } from '../../lib/cn';

export function Skeleton({ className }: { className?: string }) {
  return (
    <View
      accessibilityElementsHidden
      className={cn('overflow-hidden rounded-[10px] bg-secondary-fill', className)}
      importantForAccessibility="no-hide-descendants"
    />
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <View
      accessibilityLabel="Loading content"
      accessibilityRole="progressbar"
      className="overflow-hidden rounded-[18px] bg-paper"
    >
      {Array.from({ length: rows }, (_, index) => (
        <View
          key={index}
          className={cn(
            'min-h-[84px] flex-row items-center px-4 py-3',
            index > 0 && 'border-t border-secondary-fill',
          )}
        >
          <Skeleton className="size-11 rounded-full" />
          <View className="ml-4 flex-1 gap-2.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </View>
          <Skeleton className="size-6 rounded-full" />
        </View>
      ))}
    </View>
  );
}

export function DetailSkeleton() {
  return (
    <View accessibilityLabel="Loading reminder" accessibilityRole="progressbar" className="px-5 pt-4">
      <Skeleton className="h-7 w-32" />
      <View className="mt-7 rounded-[22px] bg-paper p-5">
        <Skeleton className="size-12 rounded-[14px]" />
        <Skeleton className="mt-6 h-7 w-4/5" />
        <Skeleton className="mt-3 h-4 w-2/3" />
        <Skeleton className="mt-8 h-14 w-full rounded-[14px]" />
      </View>
      <View className="mt-4 flex-row gap-3">
        <Skeleton className="h-24 flex-1 rounded-[18px]" />
        <Skeleton className="h-24 flex-1 rounded-[18px]" />
      </View>
    </View>
  );
}
