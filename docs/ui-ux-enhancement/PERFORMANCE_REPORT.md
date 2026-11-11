# Performance findings

Shop keeps its existing virtualized FlatList, pagination, image caching and stable product identity. Removing the category rail removes its image list and gives product imagery more space. Catalogue shadows now use lower-opacity/elevation styling. No new dependency was introduced for these refinements.

Tracking polls every five seconds only during ready/out-for-delivery while visible; other active stages use slower polling and terminal orders stop. Staff/rider polling pauses on hidden screens. GPS publishes at most approximately every five seconds and retains one current position per task. These are implementation properties, not measured device speedups.

Cold startup, memory, scroll frame timing, battery impact, mobile-network transfer and mid-range Android profiling have not been measured. Do not claim performance percentages or native smoothness from browser checks.
