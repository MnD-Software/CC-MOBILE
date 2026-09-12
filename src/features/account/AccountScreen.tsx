import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import {
  Screen,
  Section,
  AccountRequired,
  ui,
  useToast,
} from "@/components/ui/Commerce";
import { Button } from "@/components/ui/Button";
import { tokens } from "@/theme/tokens";
const links: Array<{
  name: string;
  copy: string;
  icon: keyof typeof Ionicons.glyphMap;
  href: Href;
}> = [
  {
    name: "My favourites",
    copy: "The cakes you keep coming back to",
    icon: "heart-outline",
    href: "/favourites",
  },
  {
    name: "Saved addresses",
    copy: "Less typing. More celebrating.",
    icon: "location-outline",
    href: "/addresses",
  },
  {
    name: "Cake City Rewards",
    copy: "Your points, credit and little extras",
    icon: "ribbon-outline",
    href: "/rewards",
  },
  {
    name: "My Cake Studio",
    copy: "Your saved designs, ready to revisit",
    icon: "color-palette-outline",
    href: "/(tabs)/custom",
  },
  {
    name: "Celebration reminders",
    copy: "Never miss their special day",
    icon: "calendar-outline",
    href: "/moments",
  },
  {
    name: "Offers for you",
    copy: "Something extra to smile about",
    icon: "pricetag-outline",
    href: "/offers",
  },
  {
    name: "Notifications",
    copy: "Your updates, your way",
    icon: "notifications-outline",
    href: "/notifications",
  },
  {
    name: "Find Cake City",
    copy: "Branches and collection",
    icon: "storefront-outline",
    href: "/branches",
  },
  {
    name: "Help & contact",
    copy: "A little help from our team",
    icon: "chatbubbles-outline",
    href: "/help",
  },
  {
    name: "Terms & privacy",
    copy: "The details that matter",
    icon: "shield-checkmark-outline",
    href: "/legal",
  },
];
export function AccountScreen() {
  const { customer, logout } = useAuth();
  const toast = useToast();
  return (
    <Screen title="Your Cake City." subtitle="More you. More to celebrate.">
      {customer ? (
        <View
          style={[
            ui.panel,
            { backgroundColor: tokens.color.cocoa, borderWidth: 0 },
          ]}
        >
          <View style={ui.row}>
            <View
              style={{
                width: 54,
                height: 54,
                borderRadius: 18,
                backgroundColor: "white",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={[ui.heading, { color: tokens.color.brandStrong }]}>
                {customer.first_name.slice(0, 1).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[ui.heading, { color: "white" }]}>
                {customer.first_name} {customer.last_name}
              </Text>
              <Text style={[ui.body, { color: "#F4E9E2" }]}>
                {customer.email}
              </Text>
              {customer.phone ? (
                <Text style={[ui.body, { color: "#F4E9E2" }]}>
                  {customer.phone}
                </Text>
              ) : null}
            </View>
          </View>
        </View>
      ) : (
        <AccountRequired />
      )}
      <Section title="All your good things" />
      <View>
        {links.map((link) => (
          <Pressable
            key={link.name}
            accessibilityRole="button"
            onPress={() => router.push(link.href)}
            style={[
              ui.row,
              {
                minHeight: 82,
                paddingVertical: 15,
                borderBottomWidth: 1,
                borderBottomColor: tokens.color.border,
              },
            ]}
          >
            <View
              style={[
                ui.icon,
                { backgroundColor: tokens.color.surfaceTint, borderWidth: 0 },
              ]}
            >
              <Ionicons
                name={link.icon}
                size={23}
                color={tokens.color.brandStrong}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={ui.label}>{link.name}</Text>
              <Text style={[ui.body, { fontSize: 12 }]}>{link.copy}</Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={tokens.color.muted}
            />
          </Pressable>
        ))}
      </View>
      {customer ? (
        <Button
          variant="outline"
          label="Sign out"
          onPress={async () => {
            try {
              await logout();
              toast("You have been signed out.");
            } catch {
              toast("Unable to clear your session. Try again.");
            }
          }}
        />
      ) : null}
      <Text style={[ui.body, { textAlign: "center", fontSize: 12 }]}>
        Made for the moments that matter.
      </Text>
    </Screen>
  );
}
