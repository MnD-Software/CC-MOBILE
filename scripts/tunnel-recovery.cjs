// Reconnect ngrok in the existing Expo process. Metro and its bundle cache stay alive.
function installTunnelRecovery(
  AsyncNgrok,
  {
    report = () => {},
    log = console.log,
    delay = 5000,
    schedule = setTimeout,
    cancel = clearTimeout,
  } = {},
) {
  const prototype = AsyncNgrok?.prototype;
  if (!prototype || prototype.__cakecityRecovery) return false;
  if (
    typeof prototype.connectToNgrokInternalAsync !== "function" ||
    typeof prototype._connectToNgrokAsync !== "function" ||
    typeof prototype.stopAsync !== "function"
  )
    return false;
  prototype.__cakecityRecovery = true;
  const states = new WeakMap();
  const stateFor = (owner) => {
    if (!states.has(owner))
      states.set(owner, {
        stopped: false,
        reconnecting: false,
        failures: 0,
        timer: null,
      });
    return states.get(owner);
  };
  function recover(owner) {
    const state = stateFor(owner);
    if (state.stopped || state.reconnecting || state.timer) return;
    state.timer = schedule(async () => {
      state.timer = null;
      if (state.stopped) return;
      state.reconnecting = true;
      log(
        "Reconnecting the public tunnel; Metro and your test backend stay running...",
      );
      try {
        const url = await owner._connectToNgrokAsync({ timeout: 20000 });
        if (!state.stopped) {
          owner.serverUrl = url;
          state.failures = 0;
          report({ type: "cakecity:tunnel-reconnected" });
          log("Tunnel restored. The existing bundle cache is ready.");
        }
      } catch {
        if (!state.stopped && ++state.failures >= 3) {
          state.stopped = true;
          report({ type: "cakecity:tunnel-disconnected" });
          log(
            "Tunnel recovery failed three times. The launcher will retry Expo.",
          );
        }
      } finally {
        state.reconnecting = false;
        if (!state.stopped && state.failures) recover(owner);
      }
    }, delay);
  }
  const connect = prototype.connectToNgrokInternalAsync;
  const reconnect = prototype._connectToNgrokAsync;
  prototype._connectToNgrokAsync = function (...args) {
    const state = stateFor(this);
    state.internalStops = (state.internalStops || 0) + 1;
    return reconnect.apply(this, args);
  };
  prototype.connectToNgrokInternalAsync = function (instance, ...args) {
    const owner = this,
      state = stateFor(owner);
    if (state.stopped)
      return Promise.reject(new Error("Tunnel session stopped"));
    const proxy = new Proxy(instance, {
      get(target, key) {
        if (key !== "connect") {
          const value = Reflect.get(target, key);
          return typeof value === "function" ? value.bind(target) : value;
        }
        return (options) =>
          target.connect({
            ...options,
            onStatusChange(status) {
              if (status === "closed") {
                if (!state.stopped && !state.reconnecting) recover(owner);
                return;
              }
              if (status === "connected") {
                if (state.timer) cancel(state.timer);
                state.timer = null;
              }
              options.onStatusChange?.(status);
            },
          });
      },
    });
    return connect.call(this, proxy, ...args);
  };
  const stop = prototype.stopAsync;
  prototype.stopAsync = async function (...args) {
    const state = stateFor(this);
    if (state.internalStops) state.internalStops--;
    else {
      state.stopped = true;
      if (state.timer) cancel(state.timer);
      state.timer = null;
    }
    return stop.apply(this, args);
  };
  return true;
}
module.exports = { installTunnelRecovery };
