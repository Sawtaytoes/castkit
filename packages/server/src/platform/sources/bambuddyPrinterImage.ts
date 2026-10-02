/** Resolve a printer model to an allowlisted product image on the source origin. */
export const bambuddyPrinterImage = (model: string) => {
  const normalized = model
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
  const image = [
    "h2dpro",
    "x1e",
    "x1c",
    "x2d",
    "h2d",
    "h2c",
    "p1s",
    "p1p",
    "a1mini",
    "a1",
    "a2l",
  ].find((value) => normalized.includes(value))
  const fallback = normalized.includes("h2s")
    ? "h2d"
    : normalized.includes("p2s")
      ? "p1s"
      : normalized.includes("x1")
        ? "x1c"
        : "default"
  return `/img/printers/${image ?? fallback}.png`
}
