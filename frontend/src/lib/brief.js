import jsPDF from "jspdf";

export function buildBriefPdf(p) {
  const doc = new jsPDF();
  let y = 20;
  doc.setFontSize(20); doc.text("SmartScape · Design Brief", 14, y); y += 8;
  doc.setFontSize(10); doc.setTextColor(100); doc.text(p.name, 14, y); y += 6;
  doc.text(p.location.name, 14, y); y += 10;

  const add = (title, lines) => {
    doc.setTextColor(15, 23, 42); doc.setFontSize(13); doc.text(title, 14, y); y += 6;
    doc.setFontSize(10); doc.setTextColor(60);
    lines.forEach((l) => { doc.text(l, 16, y); y += 5; });
    y += 4;
  };

  add("Project Overview", [
    `Site area: ${p.site_area_sqkm} sq.km`,
    `Target population: ${p.population.forecast_population.toLocaleString()}`,
    `Planning horizon: ${p.inputs.planning_horizon_years} years`,
    `Overall score: ${p.score.overall}/100`,
    p.boundary ? `Site boundary: ${p.boundary.source_name || "uploaded GeoJSON"}` : "Site boundary: generated blocks",
  ]);
  add("Land Use", p.zones.map((z) => `${z.name}: ${z.percentage}% (${z.area_sqkm} sq.km)`));
  add("Infrastructure", [
    `Schools: ${p.infrastructure.schools.required} required · ${p.infrastructure.schools.deficit} deficit`,
    `Hospitals: ${p.infrastructure.hospitals.required} required · ${p.infrastructure.hospitals.deficit} deficit`,
    `Parks: ${p.infrastructure.parks.required} required · ${p.infrastructure.parks.deficit} deficit`,
    `Colleges: ${p.infrastructure.colleges.required} required`,
  ]);
  add("Sustainability", [
    `Green space: ${p.sustainability.green_space_pct}%`,
    `Solar potential score: ${p.sustainability.solar_potential.score}/100`,
    `Land efficiency: ${p.sustainability.land_efficiency}%`,
  ]);
  add("Top Risks", p.risks.map((r) => `${r.title} [${r.level}] - ${r.mitigation}`));
  return doc;
}

export const briefFileName = (p) => `${p.name.replace(/\s+/g, "_")}_Design_Brief.pdf`;
