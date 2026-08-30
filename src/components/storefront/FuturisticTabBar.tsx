import { Ionicons } from '@expo/vector-icons';
import type { RefObject } from 'react';
import { Platform, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';

import { GlassSurface } from '@/components/storefront/GlassSurface';
import { tokens } from '@/theme/tokens';

export type FuturisticTab<T extends string> = {
  id: T;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  selectedIcon: keyof typeof Ionicons.glyphMap;
};

type FuturisticTabBarProps<T extends string> = {
  tabs: ReadonlyArray<FuturisticTab<T>>;
  activeId: T;
  onChange: (id: T) => void;
  /** View whose contents are blurred behind the dock on Android. */
  blurTarget?: RefObject<View | null>;
  /** Extra bottom padding from the safe-area inset. */
  bottomInset?: number;
};

/**
 * Floating frosted-glass dock with a neon gradient capsule on the active tab.
 * Detached from the screen edge so content scrolls visibly beneath it.
 */
export function FuturisticTabBar<T extends string>({
  tabs,
  activeId,
  onChange,
  blurTarget,
  bottomInset = 6,
}: FuturisticTabBarProps<T>) {
  return (
    <View
      pointerEvents="box-none"
      style={[styles.dockLayer, { paddingBottom: Math.max(bottomInset, 8) }]}
    >
      <GlassSurface
        blurTarget={blurTarget}
        intensity={88}
        style={styles.dock}
      >
        <View style={styles.row} accessibilityRole="tablist">
          {tabs.map(item => {
            const active = item.id === activeId;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${item.label} tab`}
                style={styles.tab}
                onPress={() => {
                  if (!active) Vibration.vibrate(Platform.OS === 'ios' ? 8 : 10);
                  onChange(item.id);
                }}
              >
                <View style={[styles.iconSlot, active && styles.iconSlotActive]}>
                  <Ionicons
                    name={active ? item.selectedIcon : item.icon}
                    size={20}
                    color={active ? tokens.color.brandStrong : tokens.color.mutedSoft}
                  />
                </View>
                <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  dockLayer: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 10,
    zIndex: 20,
  },
  dock: {
    borderRadius: 24,
    borderColor: '#FFFFFFF2',
    backgroundColor: '#FFFFFFE8',
    shadowColor: '#542B38',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 22,
    elevation: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 7,
  },
  tab: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 57,
    paddingVertical: 3,
  },
  iconSlot: {
    width: 39,
    height: 31,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSlotActive: { borderRadius: 14, backgroundColor: tokens.color.brandLight },
  label: {
    marginTop: 3,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800',
    color: tokens.color.mutedSoft,
    letterSpacing: 0,
  },
  labelActive: {
    color: tokens.color.brandStrong,
    fontWeight: '900',
  },
});
