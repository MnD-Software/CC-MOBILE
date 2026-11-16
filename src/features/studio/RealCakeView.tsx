import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
} from "react";
import {
  Animated,
  Easing,
  PanResponder,
  Platform,
  StyleSheet,
  Text as NativeText,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { LoadingImage } from "@/components/ui/LoadingImage";
import { performHaptic } from "@/design/haptics";
import { useScreenActive } from "@/design/useScreenActive";
import { StageControl } from "./StageControl";
import {
  DEFAULT_PLACEMENT,
  candleStripe,
  clampPan,
  clampPoint,
  pipingSize,
  plaqueStyle,
  plaqueWidth as plaqueWidthFor,
  printFrame,
  sprinkleField,
  type Placement,
  type Point,
} from "./real-cake";
import type { DeviceTier } from "@/design/device-tier";

const native = Platform.OS !== "web";
const SCRIPT_FONT = Platform.select({
  ios: "SnellRoundhand-Bold",
  android: "cursive",
  default: "'Segoe Script','Brush Script MT','Apple Chancery',cursive",
});
const SPRINKLES = sprinkleField();
const LITE_SPRINKLES = sprinkleField(24);
const FLICKER = [
  [1, 1.14, 0.93, 1.08, 0.96, 1.16, 1],
  [1, 0.94, 1.12, 0.97, 1.15, 0.95, 1],
  [1, 1.09, 0.97, 1.17, 0.92, 1.06, 1],
];
const FLICKER_STEPS = [0, 0.17, 0.33, 0.5, 0.67, 0.83, 1];

type Box = { width: number; height: number; anchorX: number; anchorY: number };

/** An addition the customer can drag around the print; commits on release. */
function Draggable({
  point,
  size,
  box,
  zoom,
  label,
  onMove,
  readOnly = false,
  children,
}: {
  point: Point;
  size: number;
  box: Box;
  zoom: { current: number };
  label: string;
  onMove: (point: Point) => void;
  readOnly?: boolean;
  children: ReactNode;
}) {
  const drag = useRef(new Animated.ValueXY()).current;
  const lift = useRef(new Animated.Value(0)).current;
  const latest = useRef({ point, size, onMove });
  latest.current = { point, size, onMove };
  // Reset the finger offset only once the committed position has rendered.
  useLayoutEffect(() => {
    drag.setValue({ x: 0, y: 0 });
  }, [point.x, point.y, drag]);
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          void performHaptic("selection");
          Animated.spring(lift, {
            toValue: 1,
            friction: 6,
            useNativeDriver: false,
          }).start();
        },
        onPanResponderMove: (_, g) =>
          drag.setValue({ x: g.dx / zoom.current, y: g.dy / zoom.current }),
        onPanResponderRelease: (_, g) => release(g.dx, g.dy),
        onPanResponderTerminate: (_, g) => release(g.dx, g.dy),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  function release(dx: number, dy: number) {
    const { point: from, size: s, onMove: commit } = latest.current;
    const next = clampPoint({
      x: from.x + dx / zoom.current / s,
      y: from.y + dy / zoom.current / s,
    });
    Animated.spring(lift, {
      toValue: 0,
      friction: 7,
      useNativeDriver: false,
    }).start();
    if (next.x === from.x && next.y === from.y) drag.setValue({ x: 0, y: 0 });
    else commit(next);
  }
  if (readOnly)
    return (
      <View
        accessibilityLabel={label}
        pointerEvents="none"
        style={{
          position: "absolute",
          left: point.x * size - box.anchorX,
          top: point.y * size - box.anchorY,
          width: box.width,
          height: box.height,
        }}
      >
        {children}
      </View>
    );
  return (
    <Animated.View
      {...responder.panHandlers}
      accessibilityLabel={label}
      style={{
        position: "absolute",
        left: point.x * size - box.anchorX,
        top: point.y * size - box.anchorY,
        width: box.width,
        height: box.height,
        transform: [
          ...drag.getTranslateTransform(),
          { scale: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) },
        ],
        // Web: stop the browser treating the drag as a text selection or scroll.
        ...(Platform.OS === "web"
          ? ({ cursor: "grab", touchAction: "none", userSelect: "none" } as object)
          : null),
      }}
    >
      {children}
    </Animated.View>
  );
}

function Plaque({
  message,
  colour,
  width,
}: {
  message: string;
  colour: string;
  width: number;
}) {
  const style = plaqueStyle(colour);
  const height = width * 0.38;
  const pop = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    Animated.spring(pop, {
      toValue: 1,
      friction: 5,
      tension: 120,
      useNativeDriver: native,
    }).start();
  }, [pop]);
  return (
    <Animated.View
      style={{
        width,
        height: height * 1.2,
        alignItems: "center",
        justifyContent: "center",
        transform: [{ scale: pop }],
      }}
    >
      <View
        style={{
          position: "absolute",
          bottom: height * 0.02,
          width: width * 0.86,
          height: height * 0.28,
          borderRadius: height,
          backgroundColor: "rgba(45,18,8,0.30)",
        }}
      />
      <View
        style={{
          width,
          height,
          transform: [{ perspective: 600 }, { rotateX: "20deg" }, { rotate: "-3deg" }],
        }}
      >
        <LinearGradient
          colors={style.surface}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={{
            flex: 1,
            borderRadius: height / 2,
            borderWidth: 1.5,
            borderColor: style.rim,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: width * 0.09,
            overflow: "hidden",
          }}
        >
          <LinearGradient
            pointerEvents="none"
            colors={["rgba(255,255,255,0.5)", "rgba(255,255,255,0)"]}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              height: "46%",
            }}
          />
          <NativeText
            numberOfLines={2}
            allowFontScaling={false}
            style={{
              fontFamily: SCRIPT_FONT,
              fontWeight: Platform.OS === "android" ? "700" : undefined,
              fontSize: pipingSize(message, width),
              lineHeight: pipingSize(message, width) * 1.08,
              color: style.ink,
              textAlign: "center",
              textShadowColor: style.inkShade,
              textShadowOffset: { width: 0, height: 1 },
              textShadowRadius: 1.5,
            }}
          >
            {message}
          </NativeText>
        </LinearGradient>
      </View>
    </Animated.View>
  );
}

function Candle({
  index,
  width,
  height,
  stripe,
  flicker,
  tier,
}: {
  index: number;
  width: number;
  height: number;
  stripe: string;
  flicker: Animated.Value;
  tier: DeviceTier;
}) {
  const flameW = width * 1.55,
    flameH = width * 2.7;
  const wave = FLICKER[index % FLICKER.length];
  return (
    <View style={{ alignItems: "center" }}>
      {(tier === "full" ? [1.6] : [6.5, 4.2, 2.4]).map((d, ring, all) => (
        <Animated.View
          key={d}
          pointerEvents="none"
          style={{
            position: "absolute",
            top: flameH * 0.15 + width * 0.8 - (width * d) / 2,
            width: width * d,
            height: width * d,
            borderRadius: width * d,
            // Full tier: one blurred halo. Lite tier: stacked soft rings,
            // which read as the same glow without an offscreen blur pass.
            backgroundColor:
              all.length === 1
                ? "rgba(255,206,110,0.35)"
                : `rgba(255,190,90,${[0.07, 0.12, 0.26][ring]})`,
            ...(all.length === 1
              ? {
                  boxShadow: `0px 0px ${Math.round(width * 4)}px ${Math.round(width * 2.2)}px rgba(255,180,70,0.42)`,
                }
              : null),
            opacity: flicker.interpolate({
              inputRange: FLICKER_STEPS,
              outputRange: wave.map((v) => 0.55 + (v - 0.9) * 1.6),
            }),
          }}
        />
      ))}
      <Animated.View
        style={{
          width: flameW,
          height: flameH,
          marginBottom: width * 0.25,
          transformOrigin: "bottom",
          transform: [
            {
              scaleY: flicker.interpolate({
                inputRange: FLICKER_STEPS,
                outputRange: wave,
              }),
            },
            {
              rotate: flicker.interpolate({
                inputRange: FLICKER_STEPS,
                outputRange: wave.map((v, i) => `${(v - 1) * (i % 2 ? 30 : -30)}deg`),
              }),
            },
          ],
        }}
      >
        <LinearGradient
          colors={["rgba(255,120,30,0)", "#FF9A2E", "#FFD45C", "#FFF8DE"]}
          locations={[0, 0.3, 0.62, 1]}
          style={{
            flex: 1,
            borderTopLeftRadius: flameW / 2,
            borderTopRightRadius: flameW / 2,
            borderBottomLeftRadius: flameW / 2,
            borderBottomRightRadius: flameW / 2,
          }}
        />
        <View
          style={{
            position: "absolute",
            bottom: 0,
            alignSelf: "center",
            width: flameW * 0.5,
            height: flameH * 0.24,
            borderRadius: flameW,
            backgroundColor: "rgba(90,130,255,0.55)",
          }}
        />
      </Animated.View>
      <View
        style={{
          width: 1.4,
          height: width * 0.55,
          backgroundColor: "#3A2A22",
        }}
      />
      <View
        style={{
          width,
          height,
          borderTopLeftRadius: width / 3,
          borderTopRightRadius: width / 3,
          overflow: "hidden",
        }}
      >
        <LinearGradient
          colors={[stripe, "#FFFFFF", stripe, "#FFFFFF", stripe, "#FFFFFF", stripe, "#FFFFFF"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0.42 }}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={["rgba(0,0,0,0.26)", "rgba(255,255,255,0.4)", "rgba(0,0,0,0.2)"]}
          locations={[0, 0.38, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </View>
    </View>
  );
}

function Topper({
  size,
  colour,
  candles,
  sprinkles,
  flicker,
  box,
  tier,
}: {
  size: number;
  colour: string;
  candles: boolean;
  sprinkles: boolean;
  flicker: Animated.Value;
  box: Box;
  tier: DeviceTier;
}) {
  const drop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!sprinkles) return;
    drop.setValue(0);
    Animated.timing(drop, {
      toValue: 1,
      duration: 1100,
      easing: Easing.out(Easing.quad),
      useNativeDriver: native,
    }).start();
  }, [sprinkles, drop]);
  const candleW = Math.max(4, size * 0.017),
    candleH = size * 0.09;
  const stripe = candleStripe(colour);
  return (
    <View style={{ width: box.width, height: box.height }} pointerEvents="box-only">
      {sprinkles
        ? (tier === "full" ? SPRINKLES : LITE_SPRINKLES).map((s) => {
            const start = s.delay / 1100;
            return (
              <Animated.View
                key={s.index}
                style={{
                  position: "absolute",
                  left: box.anchorX + s.x * size - 3,
                  top: box.anchorY + s.y * size,
                  width: Math.max(4, size * 0.014),
                  height: Math.max(1.6, size * 0.0045),
                  borderRadius: 2,
                  backgroundColor: s.colour,
                  opacity: drop.interpolate({
                    inputRange: [start, start + 0.12],
                    outputRange: [0, 1],
                    extrapolate: "clamp",
                  }),
                  transform: [
                    {
                      translateY: drop.interpolate({
                        inputRange: [start, Math.min(1, start + 0.55)],
                        outputRange: [-size * 0.22, 0],
                        extrapolate: "clamp",
                      }),
                    },
                    { rotate: `${s.rotate}deg` },
                  ],
                }}
              />
            );
          })
        : null}
      {candles ? (
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: box.anchorY - box.height * 0.82,
            height: box.height * 0.82 + candleW * 0.4,
            flexDirection: "row",
            alignItems: "flex-end",
            justifyContent: "center",
            gap: size * 0.045,
          }}
        >
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ marginBottom: i === 1 ? candleW * 0.9 : 0 }}>
              <Candle
                index={i}
                width={candleW}
                height={candleH * (i === 1 ? 1.08 : 1)}
                stripe={stripe}
                flicker={flicker}
                tier={tier}
              />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * The customer's chosen cake as photographed by the bakery, with their
 * message plaque, candles and sprinkles composited on top as a placement
 * guide. The photograph is the real product; the additions are illustrative.
 */
export function RealCakeView({
  image,
  name,
  colour,
  message,
  candles,
  sprinkles,
  reduceMotion,
  height,
  extraControls,
  placement = DEFAULT_PLACEMENT,
  onPlacementChange,
  readOnly = false,
  tier = "full",
}: {
  image: string;
  name: string;
  colour: string;
  message: string;
  candles: boolean;
  sprinkles: boolean;
  reduceMotion: boolean;
  height: number;
  extraControls?: ReactNode;
  /** Where the customer put the plaque and candles; saved with the design. */
  placement?: Placement;
  onPlacementChange?: (placement: Placement) => void;
  /** Kitchen view: shows the customer's layout without editing. */
  readOnly?: boolean;
  tier?: DeviceTier;
}) {
  const active = useScreenActive();
  const root = useRef<ComponentRef<typeof View>>(null);
  const origin = useRef({ x: 0, y: 0 });
  const [width, setWidth] = useState(0);
  const latestPlacement = useRef(placement);
  latestPlacement.current = placement;
  const move = (patch: Partial<Placement>) =>
    onPlacementChange?.({ ...latestPlacement.current, ...patch });
  const frame = printFrame(width || height, height);
  const size = frame.size;
  const zoomTarget = useRef(1);
  const zoom = useRef(new Animated.Value(1)).current;
  const pan = useRef(new Animated.ValueXY()).current;
  const panAt = useRef({ x: 0, y: 0 });
  const tilt = useRef(new Animated.ValueXY()).current;
  const breath = useRef(new Animated.Value(0)).current;
  const flicker = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;
  const additions = useRef(new Animated.Value(1)).current;
  const hint = useRef(new Animated.Value(0)).current;
  const lastTap = useRef(0);
  const trimmed = message.trim();
  const decorated = Boolean(trimmed || candles || sprinkles);

  useEffect(() => {
    if (reduceMotion || !active) return;
    const loops: Animated.CompositeAnimation[] = [];
    // The slow "breathing" zoom repaints the whole photo; lite phones skip it.
    if (tier === "full")
      loops.push(
      Animated.loop(
        Animated.sequence([
          Animated.timing(breath, {
            toValue: 1,
            duration: 5200,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: native,
            isInteraction: false,
          }),
          Animated.timing(breath, {
            toValue: 0,
            duration: 5200,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: native,
            isInteraction: false,
          }),
        ]),
      ),
      );
    if (candles)
      loops.push(
        Animated.loop(
          Animated.timing(flicker, {
            toValue: 1,
            duration: 1300,
            easing: Easing.linear,
            useNativeDriver: native,
            isInteraction: false,
          }),
        ),
      );
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [reduceMotion, active, candles, breath, flicker, tier]);

  useEffect(() => {
    hint.setValue(1);
    const fade = Animated.timing(hint, {
      toValue: 0,
      delay: 4200,
      duration: 600,
      useNativeDriver: native,
    });
    fade.start();
    return () => fade.stop();
  }, [decorated, hint]);

  function shine() {
    if (reduceMotion) return;
    sweep.setValue(0);
    Animated.timing(sweep, {
      toValue: 1,
      duration: 1400,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: native,
    }).start();
  }

  function zoomTo(scale: number, x: number, y: number) {
    zoomTarget.current = scale;
    const next = {
      x: clampPan(x * (1 - scale), scale, size),
      y: clampPan(y * (1 - scale), scale, size),
    };
    panAt.current = next;
    const config = { friction: 8, tension: 70, useNativeDriver: native };
    Animated.parallel([
      Animated.spring(zoom, { toValue: scale, ...config }),
      Animated.spring(pan, { toValue: next, ...config }),
    ]).start();
  }

  const latest = useRef({ frame, size, zoomTo, readOnly });
  latest.current = { frame, size, zoomTo, readOnly };
  const stage = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        // In a scrolling list (kitchen view) a drag scrolls unless zoomed in.
        onMoveShouldSetPanResponder: () =>
          !latest.current.readOnly || zoomTarget.current > 1,
        onPanResponderTerminationRequest: () =>
          latest.current.readOnly && zoomTarget.current <= 1,
        onPanResponderGrant: () => {
          root.current?.measureInWindow((x, y) => {
            origin.current = { x, y };
          });
        },
        onPanResponderMove: (_, g) => {
          if (zoomTarget.current > 1) {
            const s = latest.current.size;
            pan.setValue({
              x: clampPan(panAt.current.x + g.dx, zoomTarget.current, s),
              y: clampPan(panAt.current.y + g.dy, zoomTarget.current, s),
            });
          } else if (!latest.current.readOnly)
            tilt.setValue({ x: g.dx, y: g.dy });
        },
        onPanResponderRelease: (event, g) => {
          const s = latest.current.size;
          if (zoomTarget.current > 1)
            panAt.current = {
              x: clampPan(panAt.current.x + g.dx, zoomTarget.current, s),
              y: clampPan(panAt.current.y + g.dy, zoomTarget.current, s),
            };
          Animated.spring(tilt, {
            toValue: { x: 0, y: 0 },
            friction: 5,
            tension: 60,
            useNativeDriver: native,
          }).start();
          if (Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6) return;
          const now = Date.now();
          if (now - lastTap.current < 320) {
            lastTap.current = 0;
            const { frame: f, size: sz } = latest.current;
            const x =
              event.nativeEvent.pageX - origin.current.x - f.left - sz / 2;
            const y =
              event.nativeEvent.pageY - origin.current.y - f.top - sz / 2;
            void performHaptic("selection");
            if (zoomTarget.current > 1) latest.current.zoomTo(1, 0, 0);
            else latest.current.zoomTo(1.9, x, y);
          } else lastTap.current = now;
        },
        onPanResponderTerminate: () => {
          Animated.spring(tilt, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: native,
          }).start();
        },
      }),
    [pan, tilt],
  );

  const plaqueWidth = plaqueWidthFor(trimmed, size);
  const plaqueBox: Box = {
    width: plaqueWidth,
    height: plaqueWidth * 0.46,
    anchorX: plaqueWidth / 2,
    anchorY: plaqueWidth * 0.23,
  };
  const topperBox: Box = {
    width: size * 0.36,
    height: size * 0.24,
    anchorX: size * 0.18,
    anchorY: size * 0.19,
  };
  const scale = Animated.multiply(
    zoom,
    breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.025] }),
  );
  const description = [
    `Bakery photo of ${name}`,
    trimmed ? `with a plaque reading ${trimmed}` : "",
    candles ? "with lit candles" : "",
    sprinkles ? "with sprinkles" : "",
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <View
      ref={root}
      testID="diy-real-cake"
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      style={{ flex: 1, overflow: "hidden" }}
      {...stage.panHandlers}
    >
      {tier === "full" ? (
        <LoadingImage
          source={{ uri: image }}
          blurRadius={28}
          contentFit="cover"
          style={StyleSheet.absoluteFill}
          accessible={false}
        />
      ) : (
        // A live blur of a large photo is the costliest layer on budget
        // phones; the studio's own pink wall and aqua table read the same.
        <LinearGradient
          pointerEvents="none"
          colors={["#F2C3D6", "#EBC6DA", "#A9DCE0"]}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFill}
        />
      )}
      <LinearGradient
        pointerEvents="none"
        colors={["rgba(255,255,255,0.28)", "rgba(40,10,25,0.18)"]}
        style={StyleSheet.absoluteFill}
      />
      {width ? (
        <Animated.View
          accessible
          accessibilityRole="image"
          accessibilityLabel={description}
          style={{
            position: "absolute",
            left: frame.left,
            top: frame.top,
            width: size,
            height: size,
            borderRadius: 22,
            shadowColor: "#3A1426",
            shadowOpacity: 0.32,
            shadowRadius: 22,
            shadowOffset: { width: 0, height: 12 },
            elevation: 10,
            transform: [
              { perspective: 900 },
              {
                rotateY: tilt.x.interpolate({
                  inputRange: [-160, 160],
                  outputRange: ["-10deg", "10deg"],
                  extrapolate: "clamp",
                }),
              },
              {
                rotateX: tilt.y.interpolate({
                  inputRange: [-160, 160],
                  outputRange: ["8deg", "-8deg"],
                  extrapolate: "clamp",
                }),
              },
              { translateX: pan.x },
              { translateY: pan.y },
              { scale },
            ],
          }}
        >
          <View
            style={{
              flex: 1,
              borderRadius: 22,
              overflow: "hidden",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.7)",
            }}
          >
            <LoadingImage
              source={{ uri: image }}
              contentFit="cover"
              onDisplay={shine}
              style={StyleSheet.absoluteFill}
              accessible={false}
            />
            <Animated.View
              pointerEvents="box-none"
              style={[StyleSheet.absoluteFill, { opacity: additions }]}
            >
              {candles || sprinkles ? (
                <Draggable
                  point={placement.topper}
                  size={size}
                  box={topperBox}
                  zoom={zoomTarget}
                  label={
                    readOnly
                      ? "Candles and sprinkles, placed by the customer"
                      : "Candles and sprinkles, drag to place"
                  }
                  onMove={(topper) => move({ topper })}
                  readOnly={readOnly}
                >
                  <Topper
                    size={size}
                    colour={colour}
                    candles={candles}
                    sprinkles={sprinkles}
                    flicker={flicker}
                    box={topperBox}
                    tier={tier}
                  />
                </Draggable>
              ) : null}
              {trimmed ? (
                <Draggable
                  point={placement.plaque}
                  size={size}
                  box={plaqueBox}
                  zoom={zoomTarget}
                  label={`Message plaque reading ${trimmed}, ${readOnly ? "placed by the customer" : "drag to place"}`}
                  onMove={(plaque) => move({ plaque })}
                  readOnly={readOnly}
                >
                  <Plaque message={trimmed} colour={colour} width={plaqueWidth} />
                </Draggable>
              ) : null}
            </Animated.View>
            {/* Glare follows the tilt; a single light sweep plays as the photo lands. */}
            <Animated.View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: -size * 0.25,
                bottom: -size * 0.25,
                width: size * 0.5,
                left: size * 0.25,
                opacity: tilt.x.interpolate({
                  inputRange: [-160, 0, 160],
                  outputRange: [0.75, 0.18, 0.75],
                  extrapolate: "clamp",
                }),
                transform: [
                  {
                    translateX: tilt.x.interpolate({
                      inputRange: [-160, 160],
                      outputRange: [size * 0.55, -size * 0.55],
                      extrapolate: "clamp",
                    }),
                  },
                  { rotate: "18deg" },
                ],
              }}
            >
              <LinearGradient
                colors={[
                  "rgba(255,255,255,0)",
                  "rgba(255,255,255,0.32)",
                  "rgba(255,255,255,0)",
                ]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ flex: 1 }}
              />
            </Animated.View>
            <Animated.View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: -size * 0.3,
                bottom: -size * 0.3,
                width: size * 0.3,
                left: 0,
                opacity: sweep.interpolate({
                  inputRange: [0, 0.1, 0.9, 1],
                  outputRange: [0, 1, 1, 0],
                }),
                transform: [
                  {
                    translateX: sweep.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-size * 0.4, size * 1.1],
                    }),
                  },
                  { rotate: "20deg" },
                ],
              }}
            >
              <LinearGradient
                colors={[
                  "rgba(255,255,255,0)",
                  "rgba(255,255,255,0.55)",
                  "rgba(255,255,255,0)",
                ]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ flex: 1 }}
              />
            </Animated.View>
          </View>
        </Animated.View>
      ) : null}
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 10,
          bottom: 10,
          maxWidth: "70%",
          paddingHorizontal: 10,
          paddingVertical: 5,
          borderRadius: 999,
          backgroundColor: "rgba(30,10,20,0.55)",
          opacity: hint,
        }}
      >
        <NativeText
          numberOfLines={1}
          style={{ color: "#FFFFFF", fontSize: 11, fontWeight: "700" }}
        >
          {readOnly
            ? "Customer's layout · double-tap to zoom"
            : decorated
              ? "Drag your additions · double-tap to zoom"
              : "Drag to tilt · double-tap to zoom"}
        </NativeText>
      </Animated.View>
      <View
        style={{
          position: "absolute",
          top: 4,
          right: 4,
          gap: 2,
          // Three stacked buttons need ~140px; short stages lay them in a row.
          flexDirection: height < 150 ? "row" : "column",
        }}
      >
        {decorated ? (
          <StageControl
            icon="eye-outline"
            role="button"
            label="Hold to see the photo without your additions"
            onPressIn={() =>
              Animated.timing(additions, {
                toValue: 0,
                duration: 160,
                useNativeDriver: native,
              }).start()
            }
            onPressOut={() =>
              Animated.timing(additions, {
                toValue: 1,
                duration: 220,
                useNativeDriver: native,
              }).start()
            }
          />
        ) : null}
        {decorated && !readOnly ? (
          <StageControl
            icon="refresh-outline"
            role="button"
            label="Reset placement and zoom"
            onPress={() => {
              onPlacementChange?.(DEFAULT_PLACEMENT);
              zoomTo(1, 0, 0);
            }}
          />
        ) : null}
        {extraControls}
      </View>
    </View>
  );
}
