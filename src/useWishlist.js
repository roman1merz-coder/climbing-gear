import { useState, useCallback } from "react";

const KEY = "cg_wishlist"; // localStorage key

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || [];
  } catch { return []; }
}

function save(list) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

/**
 * Wishlist hook — stores [{type, slug}] in localStorage.
 * type: "shoe" | "rope" | "belay"
 */
export default function useWishlist() {
  const [items, setItems] = useState(load);

  const toggle = useCallback((type, slug) => {
    setItems(prev => {
      const exists = prev.some(i => i.type === type && i.slug === slug);
      const next = exists
        ? prev.filter(i => !(i.type === type && i.slug === slug))
        : [...prev, { type, slug }];
      save(next);
      return next;
    });
  }, []);

  const has = useCallback((type, slug) => {
    return items.some(i => i.type === type && i.slug === slug);
  }, [items]);

  const clear = useCallback(() => {
    save([]);
    setItems([]);
  }, []);

  return { items, toggle, has, clear, count: items.length };
}
