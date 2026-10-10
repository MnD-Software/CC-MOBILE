import { Screen, Notice } from "@/components/ui/Commerce";
import { Celebrations } from "@/features/account/ClubMembership";
import { useAuth } from "@/auth/AuthProvider";
import { CelebrationDashboard } from "@/features/celebrations/CelebrationDashboard";
export default function Moments() {
  const { customer } = useAuth();
  return (
    <Screen title="Celebration calendar" back>
      <CelebrationDashboard />
      {customer ? (
        <Celebrations key={customer.id} />
      ) : (
        <Notice message="Sign in to save and manage your celebrations." />
      )}
    </Screen>
  );
}
