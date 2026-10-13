# Cake City premium redesign

Owner: Cake City. Started: 13 October 2026, Africa/Nairobi.
Implementation authorized in this conversation: document and implement the full redesign.
Working direction: crisp glossy white, Cake City pink, restrained blue and cocoa.
Track delivery in [PREMIUM_CHECKPOINTS.md](PREMIUM_CHECKPOINTS.md).

## Outcome

A premium patisserie shopping experience: generous white space, complete cake
photographs, quiet navigation, confident product information, and convenient
checkout and repeat visits. Preserve existing working features and authoritative
commerce contracts. Technical tests alone do not establish visual acceptance.

## Research and decisions

Sources reviewed on 13 October 2026. Published Apple, Nike and Sephora screenshots
were inspected in the research turn. These are reference brands, not a verified
global ranking. Commercial success has multiple causes; the lessons below are
design judgments, not causal claims about revenue or retention. Features vary by
country and app version. Reference screenshots are not Cake City assets.

| Reference                                                                       | Published capability                                                                            | Cake City application                                                                                            |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| [Apple Store](https://apps.apple.com/us/app/apple-store/id375380948)            | Personalized recommendations, saved items, recent activity, order status and specialist support | Calm hierarchy, generous product space, useful saved items and browsing continuity                               |
| [Nike](https://www.nike.com/nike-app)                                           | Curated products, recommendations, editorial stories and membership experiences                 | Strong photographs and curated collections; valuable Club benefits without dominating every screen               |
| [Zara](https://www.zara.com/uk/en/help-center/StoreMode)                        | Store catalogue, pickup and finding items in selected stores                                    | Connect discovery to verified branch fulfilment; do not promise capacity or pickup times without backend support |
| [Sephora](https://apps.apple.com/us/app/sephora-us-makeup-skincare/id393328150) | Product information, community photos, comparisons, offers and loyalty rewards                  | Help choose flavour, size and servings; show ingredients/allergens only from confirmed information               |
| [Shop](https://help.shop.app/en/shop/getting-started)                           | Favourites, saved checkout details, personalization and order management                        | Reduce repeated entry and make an existing order easy to resume                                                  |
| [Starbucks](https://apps.apple.com/us/app/starbucks/id331177714)                | Customization, saved favourites, previous orders, pickup, gifting and rewards                   | Reordering and planning celebrations should be easy and useful                                                   |

[Baymard abandonment research](https://baymard.com/lists/cart-abandonment-rate)
identifies unexpected costs, forced accounts and complicated checkout as reasons
customers abandon purchases. Its [checkout study](https://baymard.com/research-articles/checkout-flow-average-form-fields)
supports reducing the fields customers must consider, rather than optimizing
screen count alone. These findings guide visible costs, guest access, saved
details and collapsed optional fields; the results are not Cake City metrics.

## Visual contract

- Main canvas and product surfaces: `#FFFFFF`. Light mode is the initial experience;
  explicitly selected dark mode remains available and readable.
- Neutral image stages and separators: cool near-white, not broad blush or beige.
- Pink `#EC008C` communicates brand and selection. A darker pink supports readable
  button labels. Blue `#00AEEF` and cocoa `#51382D` are supporting accents.
- Gloss comes from fine white highlights, subtle neutral shadows and limited
  translucent chrome. Product text and prices sit on opaque readable surfaces.
- Equal-weight Home, Shop, Club, Orders and Account navigation. No permanently
  highlighted centre destination. Respect keyboard and device safe areas.
- Clear type hierarchy: large editorial heading, readable product names, quiet
  supporting copy. Avoid shouting with every label or clipping key information.
- Shared spacing, corner radii, border and elevation tokens across all routes.
- Product photos retain their aspect ratio and complete cake. No generated
  product photos, invented prices, ratings, stock or popularity labels.
- No blur per scrolling product cell; use cached images and reduced-motion support.
- Information panels use fine neutral edges and white surfaces. Pink is a cue,
  not the page background. Empty/error/loading screens follow the same language.

## Screen and experience scope

| Area                         | Delivery requirement                                                                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home                         | Quiet white shell, editorial introduction, one restrained campaign, collections, occasion discovery and real cake recommendations; secondary tools remain reachable |
| Shop/search                  | Persistent search and bag, clear categories, budget/sort controls, consistent fitted cards, real pagination, preserved working filters                              |
| Product                      | Large fitted photography, clear live price and selected variation, confirmed servings/preparation information, accessible options, persistent purchase action       |
| Bag/checkout                 | Calm summary, editable quantities, coupon behind a disclosure, contact/address clarity, explicit verified total, secure payment handoff and recovery                |
| Club                         | White membership presentation, readable real balance/benefits, understandable reward actions and coupon tools                                                       |
| Orders                       | Readable verified status, receipt recovery, clear next action and existing buy-again discovery; no fabricated courier progress                                      |
| Account/auth                 | White profile and sign-in surfaces, concise primary actions, accessible saved items, preferences, addresses and help                                                |
| Celebration/Studio/editorial | Match shared surfaces and controls; preserve date planning, reminders, requests and guided publishing                                                               |
| Supporting routes            | Favourites, offers, branches, help, notifications and legal content inherit the system; no isolated visual theme                                                    |

## Feature and integration boundaries

Existing budget/category browsing, favourites, celebration planning/reminders,
Club APIs, receipt tracking, buy-again discovery and website checkout are audited
and reused. Source presence is not proof of production/device behavior.

| Requirement                                                       | Completion condition                                                                                                            |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Occasion, flavour and budget discovery                            | Uses published categories/product data and server filtering; no fictitious result counts                                        |
| Servings and preparation time                                     | Display only confirmed catalogue facts; unknown values invite bakery confirmation                                               |
| Required date, branch capacity and delivery slots                 | Requires authoritative WooCommerce/backend capacity reservation before being offered as guaranteed                              |
| Ingredients, allergens and dietary filters                        | Requires maintained bakery-approved product fields; never infer safety from a name or photograph                                |
| Reviews and customer photographs                                  | Requires verified source, permission/moderation and real data                                                                   |
| Reorder                                                           | Revalidate current product, variation, price and stock; require customer review before payment                                  |
| Club benefits and reminders                                       | Real account data, privacy and verified device scheduling; no invented rewards                                                  |
| One-tap payments, Google identity, password emails, remote pushes | Applicable provider/backend integration and end-to-end verification                                                             |
| Personalized recommendations                                      | Use explicit saves/recent activity or verified product evidence; do not claim AI or behavioural ranking that is not implemented |

## Acceptance and release

Visual review covers phone widths 320/390/430 and tablet 768/834, light and optional
dark mode, long names, large text, keyboard, safe areas, image failures and empty
states. Browser evidence is useful but cannot establish native glass or physical
device behavior. Android and iOS each need foreground installation/launch and
route checks before device acceptance is complete.

Engineering checks: typecheck, focused regressions, full app tests, formatting,
release configuration, web export, native bundle export, and scoped diff review.
Preserve the [13 October bug fixes](BUG_AUDIT_2026-10-13.md).
Use [existing performance budgets](PERFORMANCE_BUDGET.md), recording measurements
and conditions; never present targets as achieved without device traces.

Pushes, Render deployments, OTA publication and signed app builds are recorded
separately. A GitHub commit, successful bundle or HTTP 200 alone is not a live
or device release. Latest request authorizes implementation, not fabricated
deployment status or real purchase transactions.
