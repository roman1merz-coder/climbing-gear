import { useState, useCallback } from "react";

const KEY = "cg_price_alerts"; // localStorage key

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || [];
  } catch { return []; }
}

function save(list) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

/**
 * Price alert hook — stores alerts in localStorage.
 * Each alert: { gearType, slug, targetPrice, createdAt }
 * gearType: "shoe" | "rope" | "belay"
 */
export default function usePriceAlerts() {
  const [alerts, setAlerts] = useState(load);

  const addAlert = useCallback((gearType, slug, targetPrice) => {
    setAlerts(prev => {
      // Replace if alert already exists for this item
      const filtered = prev.filter(a => !(a.gearType === gearType && a.slug === slug));
      const next = [...filtered, { gearType, slug, targetPrice, createdAt: Date.now() }];
      save(next);
      return next;
    });
  }, []);

  const removeAlert = useCallback((gearType, slug) => {
    setAlerts(prev => {
      const next = prev.filter(a => !(a.gearType === gearType && a.slug === slug));
      save(next);
      return next;
    });
  }, []);

  const getAlert = useCallback((gearType, slug) => {
    return alerts.find(a => a.gearType === gearType && a.slug === slug) || null;
  }, [alerts]);

  const clear = useCallback(() => {
    save([]);
    setAlerts([]);
  }, []);

  return { alerts, addAlert, removeAlert, getAlert, clear, count: alerts.length };
}
