export const formatILS = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return "₪0";
  }

  try {
    return new Intl.NumberFormat("he-IL", {
      style: "currency",
      currency: "ILS",
      maximumFractionDigits: 2,
    }).format(amount);
  } catch (error) {
    const fixed = Math.round(amount * 100) / 100;
    return `₪${fixed.toFixed(fixed % 1 === 0 ? 0 : 2)}`;
  }
};
