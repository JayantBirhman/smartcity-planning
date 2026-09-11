// Builds SVG polygon coordinates for zones on top of a Leaflet map
// Using a deterministic layout — 3x3 cell grid mapped to lat/lng offsets.
export function buildZonePolygons(project) {
  if (!project) return [];
  const { location, site_area_sqkm } = project;
  const side_km = Math.sqrt(site_area_sqkm);
  // ~1 deg lat ≈ 111 km; lng scaled by cos(lat)
  const dLat = side_km / 111;
  const dLng = side_km / (111 * Math.cos((location.lat * Math.PI) / 180));
  const lat0 = location.lat - dLat / 2;
  const lng0 = location.lng - dLng / 2;

  // 3x3 grid of cells (9 cells). Distribute zones by percentage cells.
  const zones = project.zones;
  const cells = [];
  const gx = 3, gy = 3;
  for (let y = 0; y < gy; y++) for (let x = 0; x < gx; x++) cells.push({ x, y });

  // total 9 cells = 100% roughly; assign cells proportionally
  const assignments = [];
  let cellIdx = 0;
  const totalCells = 9;
  zones.forEach((z) => {
    const cellsForZone = Math.max(1, Math.round((z.percentage / 100) * totalCells));
    for (let i = 0; i < cellsForZone && cellIdx < totalCells; i++) {
      assignments.push({ zone: z, cell: cells[cellIdx++] });
    }
  });
  // if some cells left, assign to last zone
  while (cellIdx < totalCells) {
    assignments.push({ zone: zones[zones.length - 1], cell: cells[cellIdx++] });
  }

  const cellW = dLng / gx;
  const cellH = dLat / gy;

  return assignments.map((a, i) => {
    const x1 = lng0 + a.cell.x * cellW;
    const y1 = lat0 + a.cell.y * cellH;
    const x2 = x1 + cellW;
    const y2 = y1 + cellH;
    return {
      key: `${a.zone.id}-${i}`,
      zone: a.zone,
      positions: [[y1, x1], [y1, x2], [y2, x2], [y2, x1]],
    };
  });
}

export function buildInfraPoints(project) {
  if (!project) return [];
  const { location, site_area_sqkm } = project;
  const side_km = Math.sqrt(site_area_sqkm);
  const dLat = side_km / 111;
  const dLng = side_km / (111 * Math.cos((location.lat * Math.PI) / 180));
  const lat0 = location.lat - dLat / 2;
  const lng0 = location.lng - dLng / 2;

  const pts = [];
  const scatter = (count, type, label, color) => {
    for (let i = 0; i < count; i++) {
      const rx = (i * 0.618 + 0.13) % 1;
      const ry = (i * 0.382 + 0.27) % 1;
      pts.push({
        id: `${type}-${i}`,
        type, label, color,
        lat: lat0 + ry * dLat,
        lng: lng0 + rx * dLng,
      });
    }
  };
  scatter(Math.min(project.infrastructure.schools.required, 20), "school", "School", "#2563EB");
  scatter(Math.min(project.infrastructure.hospitals.required, 10), "hospital", "Hospital", "#DC2626");
  scatter(Math.min(project.infrastructure.parks.required, 15), "park", "Park", "#059669");
  return pts;
}
