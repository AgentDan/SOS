async function fetchCatalog() {
  const res = await fetch("/api/catalog");
  return res.json();
}

export { fetchCatalog };
