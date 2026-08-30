import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';
import { BrandLogo } from '@/components/BrandLogo';
import { tokens } from '@/theme/tokens';

export default function Index() {
  const { customer, isGuest, restoring } = useAuth();
  useEffect(() => {
    if (!restoring) router.replace(customer || isGuest ? '/home' : '/sign-in');
  }, [customer, isGuest, restoring]);
  if (restoring) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18, backgroundColor: tokens.color.background }}>
        <BrandLogo width={154} />
        <ActivityIndicator color={tokens.color.brandStrong} />
      </View>
    );
  }
  return null;
}
