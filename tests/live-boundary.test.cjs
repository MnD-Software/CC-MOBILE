const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

test("catalogue has one live mobile boundary and no bundled product fallback", () => {
  const api = read("src", "features", "commerce", "api.ts");
  const home = read("src", "features", "commerce", "HomeScreen.tsx");
  const shop = read("src", "features", "commerce", "ShopScreen.tsx");
  const product = read("src", "features", "commerce", "ProductScreen.tsx");

  assert.match(api, /\/v1\/catalogue\/products\?/);
  assert.match(api, /CATALOGUE_TIMEOUT_MS = 15_000/);
  assert.match(api, /cachedLiveCatalogueProducts/);
  assert.match(api, /rememberLiveCatalogueProducts/);
  assert.match(api, /CATALOGUE_STALE_TIME_MS = 5 \* 60_000/);
  assert.match(api, /productCache/);
  assert.match(api, /findProducts/);
  assert.match(api, /category\?: number/);
  assert.match(api, /productsByCategory/);
  assert.match(api, /STORE_CATEGORY_FALLBACK_URL/);
  assert.match(api, /category: String\(category\)/);

  for (const source of [home, shop, product]) {
    assert.doesNotMatch(source, /reference-catalogue|referenceCakes/);
    assert.match(source, /staleTime: CATALOGUE_STALE_TIME_MS/);
    assert.match(source, /refetchOnMount: false/);
    assert.match(source, /refetchOnWindowFocus: false/);
  }

  assert.equal(
    fs.existsSync(
      path.join(root, "src", "features", "commerce", "reference-catalogue.ts"),
    ),
    false,
  );
});

test("registration form matches the deployed email-auth contract", () => {
  const screen = read("src", "features", "auth", "AuthScreen.tsx");
  const authApi = read("src", "auth", "api.ts");

  assert.match(screen, /password\.length < 8/);
  assert.match(screen, /if \(!last\.trim\(\)\)/);
  assert.match(screen, /maxLength=\{80\}/);
  assert.match(authApi, /AUTH_TIMEOUT_MS = 45_000/);
  assert.match(authApi, /timeoutMs: AUTH_TIMEOUT_MS/);
});

test("EAS preview and production builds embed the live mobile endpoint", () => {
  const eas = JSON.parse(read("eas.json"));
  for (const profile of ["preview", "production"]) {
    assert.equal(
      eas.build[profile].env.EXPO_PUBLIC_API_URL,
      "https://cc-mobile-1.onrender.com",
    );
  }
});

test("unconnected account routes fail honestly while checkout uses Cake City's server cart", () => {
  const unavailable = read(
    "src",
    "components",
    "ui",
    "UnavailableExperience.tsx",
  );
  const commerce = read("src", "components", "ui", "Commerce.tsx");
  const routes = [
    "addresses.tsx",
    "branches.tsx",
    "offers.tsx",
    "moments.tsx",
    "notifications.tsx",
  ].map((route) => read("app", route));

  assert.match(unavailable, /Browse live cakes/);
  assert.match(unavailable, /does not provide yet/);
  assert.doesNotMatch(commerce, /right === undefined \? <BagButton/);

  for (const source of routes) {
    assert.match(source, /UnavailableExperience/);
    assert.doesNotMatch(source, /api\.|customerApi|shopApi|useQuery/);
  }

  const cart = read("app", "cart.tsx");
  const checkout = read("app", "checkout.tsx");
  const checkoutScreen = read(
    "src",
    "features",
    "commerce",
    "CheckoutScreen.tsx",
  );
  const websiteCheckout = read(
    "src",
    "features",
    "commerce",
    "website-checkout.ts",
  );
  const orders = read("src", "features", "account", "OrdersScreen.tsx");
  assert.match(cart, /CartScreen/);
  assert.match(checkout, /CheckoutScreen/);
  assert.match(
    checkoutScreen,
    /prepareWebsiteCheckoutCart\(lines, fingerprint, ownerScope\)/,
  );
  assert.match(checkoutScreen, /useMutation/);
  assert.doesNotMatch(checkoutScreen, /useQuery/);
  assert.match(checkoutScreen, /submitWebsiteCheckout/);
  assert.match(websiteCheckout, /for \(const line of lines\)/);
  assert.match(websiteCheckout, /\/cart\/add-item/);
  assert.match(websiteCheckout, /"\/checkout"/);
  assert.match(websiteCheckout, /\/order\/\$\{order\.id\}/);
  assert.match(orders, /refetchInterval/);
  assert.match(orders, /fetchWebsiteOrder/);
  assert.doesNotMatch(cart, /UnavailableExperience/);
  assert.doesNotMatch(checkout, /UnavailableExperience/);
});

test("Cake City Club manages real customer codes without inventing issued rewards", () => {
  const rewardsRoute = read("app", "rewards.tsx");
  const rewards = read("src", "features", "account", "RewardsScreen.tsx");

  assert.match(rewardsRoute, /RewardsScreen/);
  assert.match(rewards, /Your coupon wallet/);
  assert.match(rewards, /useCouponWallet/);
  assert.match(rewards, /saveCouponCode/);
  assert.match(rewards, /removeCouponCode/);
  assert.match(rewards, /Club points: not connected/);
  assert.match(rewards, /eligibility checked at checkout/);
  assert.match(rewards, /Guest codes stay only in this app session/);
  assert.doesNotMatch(rewards, /Saved cakes/);
  assert.doesNotMatch(
    rewards,
    /accountCommerceApi|customerApi|useQuery|getRewards|points_balance|redeem/,
  );
});

test("account hub uses authenticated and device-local data without invented account state", () => {
  const account = read("src", "features", "account", "AccountScreen.tsx");

  assert.match(account, /ProfileAvatar/);
  assert.match(account, /savedProductSlugs/);
  assert.match(account, /state\.designs\[customer\?\.id \?\? "guest"\]/);
  assert.match(account, /tel:\+254709729000/);
  assert.match(account, /Cake City Club/);
  assert.match(account, /<BagButton\s*\/>/);
  assert.doesNotMatch(
    account,
    /accountCommerceApi|customerApi|useQuery|points_balance|redeem/,
  );
});

test("catalogue browsing keeps search and bag controls outside the product scroll", () => {
  const commerce = read("src", "components", "ui", "Commerce.tsx");
  const home = read("src", "features", "commerce", "HomeScreen.tsx");
  const shop = read("src", "features", "commerce", "ShopScreen.tsx");

  assert.match(commerce, /export function CommerceBrowseHeader/);
  assert.match(commerce, /<BagButton\s*\/>/);
  assert.match(home, /<Screen\s+scroll=\{false\}[\s\S]*?<CommerceBrowseHeader/);
  assert.doesNotMatch(home, /headerCompact|updateHeader|onScroll=/);
  assert.match(commerce, /height: 44/);
  assert.match(shop, /<Screen\s+scroll=\{false\}[\s\S]*?<CommerceBrowseHeader/);
  assert.match(shop, /ref=\{searchInputRef\}/);
  assert.match(shop, /keyboardDismissMode="on-drag"/);
});

test("home puts live Deals & Steals ahead of a visual collection navigator", () => {
  const home = read("src", "features", "commerce", "HomeScreen.tsx");
  const collection = read(
    "src",
    "features",
    "commerce",
    "collection-artwork.ts",
  );
  assert.match(home, /isDealsAndSteals/);
  assert.match(home, /is_in_stock/);
  assert.match(home, /is_purchasable/);
  assert.match(home, /deals-and-steals/);
  assert.doesNotMatch(home, /productsForCategory/);
  assert.match(home, /productsByCategory\(229/);
  assert.match(home, /Signature Cakes/);
  assert.match(home, /occasionIdeas/);
  assert.match(home, /Birthday/);
  assert.match(home, /Pink Simba/);
  assert.match(home, /Anniversary/);
  assert.match(
    home,
    /id: "anniversary",\s+title: "Anniversary",[\s\S]+query: "romantic red floral"/,
  );
  assert.match(home, /department: "Anniversary cakes"/);
  assert.match(home, /FLORAL-27\.avif/);
  assert.match(home, /id: "pink-simba"[\s\S]+id: "anniversary"/);
  assert.doesNotMatch(home, /QuickAction/);
  assert.match(home, /OccasionRail/);
  assert.match(home, /styles\.occasionChip/);
  assert.match(home, /styles\.occasionArtwork/);
  assert.match(home, /recyclingKey=\{`occasion-\$\{occasion\.id\}`\}/);
  assert.match(home, /useSafeAreaInsets/);
  assert.doesNotMatch(home, /Math\.max\(280/);
  assert.match(home, /key=\{carouselLayoutKey\}/);
  assert.match(collection, /Signature Cakes/);
  assert.match(collection, /Custom Cakes/);
  assert.match(collection, /Chocolate Base Sponge/);
  assert.match(collection, /Vanilla Base Sponge/);
  assert.match(collection, /Pound Cakes/);
  assert.match(collection, /Cheese Cakes/);
  assert.doesNotMatch(home, /PremiumProductCarousel/);
});

test("catalogue proxy validates and forwards a numeric category filter", () => {
  const routes = read("backend", "app", "routes.py");
  assert.match(routes, /category: int \| None = Query\(default=None, ge=1\)/);
  assert.match(routes, /params\["category"\] = category/);
});

test("custom-cake fallback shares a picked inspiration without claiming an unverified API upload", () => {
  const studio = read("src", "features", "studio", "StudioScreen.tsx");
  const brief = read("src", "features", "studio", "CustomCakeBrief.tsx");
  assert.match(studio, /CustomCakeBrief/);
  assert.match(brief, /ImagePicker\.launchImageLibraryAsync/);
  assert.match(brief, /ImagePicker\.getPendingResultAsync/);
  assert.match(brief, /Sharing\.shareAsync/);
  assert.match(brief, /wa\.me/);
  assert.doesNotMatch(brief, /\/v1\/custom-cakes/);
});

test("variable cakes use live Store API records instead of parent-price guesses", () => {
  const product = read("src", "features", "commerce", "ProductScreen.tsx");
  const variations = read("src", "features", "commerce", "store-variations.ts");
  const contracts = read("src", "features", "commerce", "contracts.ts");
  const checkout = read("src", "features", "commerce", "website-checkout.ts");

  assert.match(variations, /include: ids\.join\(","\)/);
  assert.match(variations, /type: "variation"/);
  assert.match(variations, /is_in_stock/);
  assert.match(variations, /is_purchasable/);
  assert.match(product, /fetchLiveVariations/);
  assert.match(
    product,
    /price = variationRequired \? selectedVariationPrice : basePrice/,
  );
  assert.match(product, /variationCartAttributes/);
  assert.match(contracts, /variation_attributes/);
  assert.match(checkout, /function lineVariation/);
  assert.match(checkout, /\.\.\.\(variation \? \{ variation \} : \{\}\)/);
});

test("search, account identity and checkout location stay customer-controlled", () => {
  const shop = read("src", "features", "commerce", "ShopScreen.tsx");
  const checkout = read("src", "features", "commerce", "CheckoutScreen.tsx");
  const billing = read("src", "features", "commerce", "billing-profile.ts");
  const tabs = read("app", "(tabs)", "_layout.tsx");
  const help = read("app", "help.tsx");
  const appConfig = read("app.json");

  assert.match(shop, /perPage: 16/);
  assert.match(shop, /const changeSearch/);
  assert.match(shop, /setCategory\(undefined\)/);
  assert.match(shop, /rememberSearch\(search\.trim\(\)\)/);
  assert.match(shop, /shopApi\.browseProducts/);
  assert.match(shop, /getNextPageParam:.*last\.nextPage/);
  assert.match(shop, /layout="row"/);
  assert.match(shop, /styles\.sidebar/);
  assert.match(shop, /initialNumToRender=\{6\}/);
  assert.match(shop, /maxToRenderPerBatch=\{6\}/);
  assert.match(shop, /removeClippedSubviews=\{Platform\.OS === "android"\}/);
  assert.match(shop, /useSafeAreaInsets/);
  assert.match(shop, /paddingBottom: insets\.bottom \+ 128/);
  assert.match(checkout, /Location\.requestForegroundPermissionsAsync/);
  assert.match(checkout, /Location\.reverseGeocodeAsync/);
  assert.match(checkout, /loadBillingProfile/);
  assert.match(checkout, /saveBillingProfile/);
  assert.match(billing, /getStorageItem/);
  assert.match(billing, /setStorageItem/);
  assert.match(billing, /PROFILE_PREFIX/);
  assert.doesNotMatch(checkout, /requestBackgroundPermissionsAsync/);
  assert.doesNotMatch(checkout, /startGeofencingAsync/);
  assert.doesNotMatch(appConfig, /BackgroundLocationEnabled/);
  assert.match(tabs, /import \{ Tabs \} from "expo-router"/);
  assert.match(
    tabs,
    /<Tabs\.Screen name="custom" options=\{\{ href: null \}\}/,
  );
  assert.match(
    tabs,
    /<Tabs\.Screen name="search" options=\{\{ title: "Search", href: null \}\}/,
  );
  assert.match(help, /tel:\+254709729000/);
  assert.doesNotMatch(help, /contact-us/);
});

test("preview launch keeps tabs and updates compatible with the installed build", () => {
  const tabs = read("app", "(tabs)", "_layout.tsx");
  const boundary = read("src", "components", "ui", "Commerce.tsx");
  const appConfig = read("app.json");

  assert.match(tabs, /import \{ Tabs \} from "expo-router"/);
  assert.doesNotMatch(tabs, /unstable-native-tabs/);
  assert.match(
    tabs,
    /<Tabs\.Screen name="custom" options=\{\{ href: null \}\}/,
  );
  assert.match(
    tabs,
    /<Tabs\.Screen name="search" options=\{\{ title: "Search", href: null \}\}/,
  );
  assert.match(appConfig, /"runtimeVersion": \{\s+"policy": "appVersion"/);
  assert.match(boundary, /componentDidCatch\(error: Error, info: ErrorInfo\)/);
  assert.match(boundary, /\[Cake City\] Screen render failed/);
});

test("product tiles are one continuous fitted card surface", () => {
  const commerce = read("src", "components", "ui", "Commerce.tsx");
  const artwork = read("src", "components", "ui", "ReferenceArtwork.tsx");
  const card = read("src", "components", "ui", "ProductCard.tsx");
  const tile = commerce.slice(
    commerce.indexOf("export const ProductTile"),
    commerce.indexOf("const ToastContext"),
  );

  assert.match(tile, /memo\(function ProductTile/);
  assert.match(tile, /<CakeArtwork\s+source=\{product\.images\[0\]\.src\}/);
  assert.match(tile, /PRODUCT_TILE_CANVAS/);
  assert.match(
    tile,
    /recyclingKey=\{`\$\{product\.id\}:\$\{product\.images\[0\]\.src\}`\}/,
  );
  assert.doesNotMatch(tile, /margin: 8,/);
  assert.doesNotMatch(tile, /marginBottom: 0,/);
  assert.doesNotMatch(tile, /backgroundColor: "rgba\(255,245,250,0\.74\)"/);
  assert.match(artwork, /contentFit="contain"/);
  assert.match(artwork, /contentPosition="center"/);
  assert.match(artwork, /cachePolicy="memory-disk"/);
  assert.match(artwork, /recyclingKey=\{recyclingKey \?\? source\}/);
  assert.match(card, /cachePolicy="memory-disk"/);
  assert.match(
    card,
    /recyclingKey=\{`\$\{product\.id\}:\$\{product\.image\}`\}/,
  );
  const product = read("src", "features", "commerce", "ProductScreen.tsx");
  assert.match(product, /width - insets\.left - insets\.right/);
  assert.match(product, /key=\{`\$\{cake\.id\}:\$\{viewportWidth\}`\}/);
});
