async function fetchCatalog() {
  const res = await fetch("/api/catalog");
  if (!res.ok) throw new Error(`GET /api/catalog failed: ${res.status}`);
  return res.json();
}

export { fetchCatalog };
