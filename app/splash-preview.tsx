import { Redirect } from "expo-router";
import { View } from "react-native";
import { BrandSplash } from "@/components/ui/BrandEntrance";

export default function SplashPreview() {
  if (!__DEV__) return <Redirect href="/(tabs)" />;
  return (
    <View style={{ flex: 1 }}>
      <BrandSplash />
    </View>
  );
}
