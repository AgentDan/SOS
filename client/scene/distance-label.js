// Under 1 mm the objects count as touching. Otherwise show centimeters to 0.1.

function formatDistanceLabel(distanceMm) {
  if (typeof distanceMm !== "number" || !Number.isFinite(distanceMm) || distanceMm < 1) {
    return "вплотную";
  }
  const centimeters = Math.round(distanceMm) / 10;
  return `${centimeters.toFixed(1).replace(".", ",")} см`;
}

export { formatDistanceLabel };
