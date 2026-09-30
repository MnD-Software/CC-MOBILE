import { UnavailableExperience } from "@/components/ui/UnavailableExperience";

export default function ResetPassword() {
  return (
    <UnavailableExperience
      title="Reset password"
      heading="Password recovery is not connected yet."
      message="Please contact Cake City support for account help, or return to sign in if you already know your password."
      icon="key-outline"
      actionLabel="Back to sign in"
      actionHref="/sign-in"
    />
  );
}
