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

/** Reference-aligned five-item storefront navigation with native safe-area padding. */
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
      style={[styles.dockLayer, { paddingBottom: Math.max(bottomInset, 5) }]}
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
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
    backgroundColor: '#FFFFFFF7',
  },
  dock: {
    borderRadius: 0,
    borderWidth: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: tokens.color.borderStrong,
    backgroundColor: '#FFFFFFF7',
    shadowColor: '#5D263C',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 5,
    paddingTop: 5,
    paddingBottom: 3,
  },
  tab: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    paddingVertical: 2,
  },
  iconSlot: {
    width: 36,
    height: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSlotActive: { borderRadius: 9, backgroundColor: tokens.color.brandLight },
  label: {
    marginTop: 2,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '800',
    color: tokens.color.mutedSoft,
    letterSpacing: 0,
  },
  labelActive: {
    color: tokens.color.brandStrong,
    fontWeight: '900',
  },
});
