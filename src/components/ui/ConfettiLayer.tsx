import {
  createContext,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { Animated, View } from "react-native";
import { ConfettiBurst } from "./ConfettiBurst";

type Registration = { id: symbol; motion: Animated.Value };
const ConfettiLayer = createContext<
  ((motion: Animated.Value) => () => void) | null
>(null);

/** Keeps celebration particles out of scrolling/clipped order content. */
export function ConfettiLayerProvider({ children }: PropsWithChildren) {
  const [active, setActive] = useState<Registration | null>(null);
  const register = useMemo(
    () => (motion: Animated.Value) => {
      const id = Symbol("payment-confetti");
      setActive({ id, motion });
      return () =>
        setActive((current) => (current?.id === id ? null : current));
    },
    [],
  );
  return (
    <ConfettiLayer.Provider value={register}>
      <View style={{ flex: 1 }}>
        {children}
        {active ? (
          <ConfettiBurst
            motion={active.motion}
            testID="payment-success-confetti"
          />
        ) : null}
      </View>
    </ConfettiLayer.Provider>
  );
}
export const useConfettiLayer = () => useContext(ConfettiLayer);
