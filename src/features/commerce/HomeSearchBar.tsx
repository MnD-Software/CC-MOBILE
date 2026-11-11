import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { GlassSurface } from "@/components/storefront/GlassSurface";
import { tokens } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { SearchPredictions } from "./SearchPredictions";

export function HomeSearchBar() {
  const { colors } = useTheme();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const submit = (value = query) => {
    setFocused(false);
    router.navigate({
      pathname: "/(tabs)/search",
      params: {
        search: value.trim(),
        focus: "1",
        // Reapply Home's query even if the results tab was edited since this search.
        searchRequest: String(Date.now()),
      },
    });
  };

  return (
    <GlassSurface opaque style={styles.surface}>
      <View style={styles.row}>
        <Ionicons
          accessible={false}
          color={colors.brandStrong}
          name="search-outline"
          size={20}
        />
        <TextInput
          accessibilityLabel="Search cakes, flavours and themes"
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={(value) => {
            setQuery(value);
            setFocused(true);
          }}
          onFocus={() => setFocused(true)}
          onSubmitEditing={() => submit()}
          placeholder="Search cakes, flavours, themes…"
          placeholderTextColor={colors.muted}
          returnKeyType="search"
          style={[styles.input, { color: colors.cocoa }]}
          value={query}
        />
        <Pressable
          accessibilityLabel="Search products"
          accessibilityRole="button"
          hitSlop={4}
          onPress={() => submit()}
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: colors.brandStrong,
              opacity: pressed ? 0.75 : 1,
            },
          ]}
        >
          <Ionicons color="#FFFFFF" name="arrow-forward" size={20} />
        </Pressable>
      </View>
      <SearchPredictions query={query} active={focused} onSearch={submit} />
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  surface: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  row: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 12,
    paddingRight: 4,
  },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    fontSize: 13.5,
    paddingVertical: 0,
  },
  button: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});
