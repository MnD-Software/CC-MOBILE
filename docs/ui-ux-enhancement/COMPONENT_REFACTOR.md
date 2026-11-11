# Shared components

Updated existing Button, ProductTile, FloatingTabBar, ShopScreen and theme tokens. Added OrderJourney and platform-specific LiveDeliveryMap components rather than duplicating whole order screens. Shared live-tracking helpers expire stale location data locally; the rider GPS component is trip-scoped and explicitly activated.

The web dashboard reuses its form editor and authenticated request function, and now calls the same kitchen/logistics API contracts as mobile. The backend map route serves a static shell; authenticated order responses supply private coordinates separately. See [tracking contract](../LIVE_ORDER_TRACKING.md).
