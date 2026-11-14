/* Preserve the work in view while a queue refresh replaces its records. */
const CakeCityQueuePosition = {
  capture(content, viewport = window) {
    const cards = [
      ...content.querySelectorAll("[data-work], [data-trip-card]"),
    ];
    const card = cards.find(
      (node) => node.getBoundingClientRect().bottom > 100,
    );
    const parents = [];
    for (let node = content; node; node = node.parentElement)
      parents.push([node, node.scrollTop, node.scrollLeft]);
    return {
      x: viewport.scrollX,
      y: viewport.scrollY,
      parents,
      key: card?.dataset.work || card?.dataset.tripCard,
      top: card?.getBoundingClientRect().top,
      expanded: [...content.querySelectorAll("details[open]")]
        .map((node) => node.id)
        .filter(Boolean),
    };
  },
  restore(content, saved, viewport = window) {
    for (const [node, top, left] of saved.parents) {
      node.scrollTop = top;
      node.scrollLeft = left;
    }
    viewport.scrollTo(saved.x, saved.y);
    for (const node of content.querySelectorAll("details"))
      if (saved.expanded.includes(node.id)) node.open = true;
    if (!saved.key) return;
    const card = [
      ...content.querySelectorAll("[data-work], [data-trip-card]"),
    ].find(
      (node) => (node.dataset.work || node.dataset.tripCard) === saved.key,
    );
    if (card) {
      const delta = card.getBoundingClientRect().top - saved.top;
      const scrollParent = saved.parents.find(
        ([node]) =>
          node.scrollHeight > node.clientHeight + 1 &&
          getComputedStyle(node).overflowY !== "visible",
      );
      if (scrollParent) scrollParent[0].scrollTop += delta;
      else viewport.scrollTo(saved.x, saved.y + delta);
    }
  },
};
if (typeof module !== "undefined") module.exports = CakeCityQueuePosition;
