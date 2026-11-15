import { ClubAppearanceControl, ClubPageTheme } from "./ClubAppearance";
import { HeaderActions } from "@/components/storefront/HeaderActions";
import { ClubMembership } from "./ClubMembership";
import { PromotionsShelf } from "@/features/commerce/PromotionsShelf";
import { ClubWelcome } from "./ClubWelcome";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View, type ScrollViewInstance } from "react-native";
import { Text } from "@/components/ui/Typography";
import { useAuth } from "@/auth/AuthProvider";
import { Screen, CommerceBrowseHeader } from "@/components/ui/Commerce";
import { Button } from "@/components/ui/Button";
import { Disclosure } from "@/components/ui/Disclosure";
import { useCouponWallet } from "@/features/commerce/coupon-wallet";
import { useTheme } from "@/theme/ThemeProvider";
import { BrandLogo } from "@/components/BrandLogo";
import { useScreenActive } from "@/design/useScreenActive";

export function RewardsScreen() {
  return (
    <ClubPageTheme>
      <RewardsContent />
    </ClubPageTheme>
  );
}
function RewardsContent() {
  const { milestone } = useLocalSearchParams<{ milestone?: string }>();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const focused = useScreenActive();
  const viewedMilestone = useRef<string | undefined>(undefined);
  const [memberY, setMemberY] = useState(0);
  useEffect(() => {
    if (
      !focused ||
      !milestone ||
      !memberY ||
      viewedMilestone.current === milestone
    )
      return;
    const frame = requestAnimationFrame(() => {
      if (!scrollRef.current) return;
      scrollRef.current.scrollTo({
        y: Math.max(0, memberY - 12),
        animated: false,
      });
      viewedMilestone.current = milestone;
    });
    return () => cancelAnimationFrame(frame);
  }, [focused, milestone, memberY]);
  const { customer } = useAuth();
  const wallet = useCouponWallet(customer?.id);
  const { colors } = useTheme();
  return (
    <Screen
      backgroundColor={colors.background}
      scrollRef={scrollRef}
      header={
        <CommerceBrowseHeader
          brand={<BrandLogo width={105} />}
          right={<HeaderActions />}
        >
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            A little extra with every celebration
          </Text>
        </CommerceBrowseHeader>
      }
    >
      <ClubWelcome name={customer?.first_name} />
      <PromotionsShelf />
      <Disclosure title="Choose my page colours">
        <ClubAppearanceControl />
      </Disclosure>
      <View onLayout={(event) => setMemberY(event.nativeEvent.layout.y)}>
        <ClubMembership
          key={wallet.scope}
          walletScope={wallet.scope}
          revealToken={milestone}
        />
      </View>
      {!customer ? (
        <Button
          label="Sign in to Club"
          onPress={() => router.push("/sign-in")}
        />
      ) : null}
    </Screen>
  );
}
