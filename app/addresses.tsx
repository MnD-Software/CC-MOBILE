import { UnavailableExperience } from "@/components/ui/UnavailableExperience";

export default function Addresses() {
  return (
    <UnavailableExperience
      title="Saved addresses"
      heading="Address saving is being connected."
      message="Your account is secure. Saved delivery addresses will appear here when the live account service is available."
      icon="location-outline"
    />
  );
}
