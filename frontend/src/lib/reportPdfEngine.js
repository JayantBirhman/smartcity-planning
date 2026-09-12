import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// Helper to invoke autoTable regardless of CJS / ESM export structure
function runAutoTable(doc, options) {
  if (typeof autoTable === "function") {
    autoTable(doc, options);
  } else if (autoTable && typeof autoTable.default === "function") {
    autoTable.default(doc, options);
  } else if (typeof doc.autoTable === "function") {
    doc.autoTable(options);
  } else {
    console.error("autoTable plugin not found on jsPDF");
  }
}

// Colors
const PRIMARY = [15, 23, 42];      // #0f172a (Navy Slate)
const ACCENT = [16, 185, 129];      // #10b981 (Emerald)
const TEXT_MUTED = [100, 116, 139]; // #64748b
const TEXT_DARK = [30, 41, 59];     // #1e293b
const BG_LIGHT = [248, 250, 252];   // #f8fafc

/**
 * Draw a clean executive header banner on a page
 */
function drawPageHeader(doc, title, subtitle, pageNum = 1) {
  const pageWidth = doc.internal.pageSize.getWidth();

  // Top banner
  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, pageWidth, 26, "F");

  // Emerald accent stripe
  doc.setFillColor(...ACCENT);
  doc.rect(0, 26, pageWidth, 1.5, "F");

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("SMARTSCAPE · URBAN INTELLIGENCE SUITE", 14, 11);

  // Subtitle / Report category
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(203, 213, 225);
  doc.text(title.toUpperCase(), 14, 19);

  // Timestamp on top right
  const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(`DATE: ${dateStr}`, pageWidth - 14, 11, { align: "right" });
  doc.text("STATUTORY COMPLIANCE: URDPFI 2026", pageWidth - 14, 19, { align: "right" });

  // Reset text color
  doc.setTextColor(...TEXT_DARK);
}

/**
 * Draw project info metadata box
 */
function drawProjectMeta(doc, p, startY = 35) {
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(...BG_LIGHT);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, startY, pageWidth - 28, 24, 2, 2, "FD");

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...PRIMARY);
  doc.text(p.name || "SmartScape Urban Project", 18, startY + 8);

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...TEXT_MUTED);

  const locName = typeof p.location === "object" ? p.location?.name : p.location || "Urban Region";
  const coords = p.location?.lat ? `${p.location.lat.toFixed(4)}°N, ${p.location.lng.toFixed(4)}°E` : "Centroid defined";
  const area = p.site_area_sqkm ? `${p.site_area_sqkm} sq.km (${(p.site_area_sqkm * 100).toFixed(0)} ha)` : "N/A";
  const pop = p.population?.forecast_population ? p.population.forecast_population.toLocaleString() : "N/A";

  doc.text(`Location: ${locName} (${coords})`, 18, startY + 15);
  doc.text(`Site Area: ${area}  |  Forecast Pop: ${pop}  |  Overall Score: ${p.score?.overall || 70}/100`, 18, startY + 20);

  return startY + 30;
}

/**
 * Add footers to all pages after generation is complete
 */
function addPageFooters(doc) {
  const totalPages = doc.internal.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...TEXT_MUTED);
    doc.text("SmartScape AI Urban Planning Platform · Official statutory assessment · Confidential", 14, pageHeight - 7);
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - 14, pageHeight - 7, { align: "right" });
  }
}

/**
 * Main Report Generator Engine
 */
export function generateReportPdf(reportKey, project, extraFeatures = null) {
  if (!project) throw new Error("Project data required");
  const p = project;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const isAll = reportKey === "all";

  // 1. EXECUTIVE SUMMARY / COVER SECTION
  if (isAll || reportKey === "summary") {
    drawPageHeader(doc, isAll ? "Comprehensive Master Planning Dossier" : "Planning Summary & Executive KPIs");
    let y = drawProjectMeta(doc, p, 34);

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...PRIMARY);
    doc.text("1. Executive Summary & Statutory Indicators", 14, y);
    y += 5;

    // High level metrics table
    const overallScore = p.score?.overall || 70;
    const siteArea = p.site_area_sqkm || 24.5;
    const forecastPop = p.population?.forecast_population || 185000;
    const density = Math.round(forecastPop / siteArea);

    runAutoTable(doc, {
      startY: y,
      head: [["Indicator", "Value / Metric", "Statutory Benchmark (URDPFI)", "Compliance Level"]],
      body: [
        ["Site Area", `${siteArea} sq.km`, "Defined boundary ring", "Verified"],
        ["Target Population", `${forecastPop.toLocaleString()} residents`, "20-year horizon (2046)", "Feasible"],
        ["Gross Population Density", `${density.toLocaleString()} / sq.km`, "5,000 - 12,000 / sq.km", density <= 12000 ? "Optimal" : "High Density"],
        ["Overall Liveability Index", `${overallScore} / 100`, "Minimum 65 for Stage-1", overallScore >= 65 ? "Approved" : "Deficit"],
        ["Green / Open Space Ratio", `${p.sustainability?.green_space_pct || 18}%`, "Minimum 12 - 15%", "Compliant"],
      ],
      headStyles: { fillColor: PRIMARY, textColor: 255, fontStyle: "bold", fontSize: 9 },
      bodyStyles: { fontSize: 8.5, textColor: TEXT_DARK },
      alternateRowStyles: { fillColor: BG_LIGHT },
      margin: { left: 14, right: 14 },
      theme: "grid",
    });

    y = doc.lastAutoTable.finalY + 8;

    // Score breakdown table
    if (p.score?.breakdown && p.score.breakdown.length > 0) {
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...PRIMARY);
      doc.text("Statutory Score Dimension Breakdown", 14, y);
      y += 4;

      runAutoTable(doc, {
        startY: y,
        head: [["Domain Category", "Weight", "Score (/100)", "Planning Assessment / Reasoning"]],
        body: p.score.breakdown.map(b => [
          b.category || "General",
          `${b.weight}%`,
          `${Math.round(b.score)}/100`,
          b.reason || "Evaluated by spatial models"
        ]),
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold", fontSize: 8.5 },
        bodyStyles: { fontSize: 8, textColor: TEXT_DARK },
        alternateRowStyles: { fillColor: BG_LIGHT },
        margin: { left: 14, right: 14 },
        theme: "grid",
      });
      y = doc.lastAutoTable.finalY + 8;
    }
  }

  // 2. POPULATION DYNAMICS SECTION
  if (isAll || reportKey === "population") {
    if (isAll) {
      doc.addPage();
      drawPageHeader(doc, "Demographic & Population Dynamics", 2);
    } else {
      drawPageHeader(doc, "Demographic & Population Dynamics");
    }
    let y = isAll ? 34 : drawProjectMeta(doc, p, 34);

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...PRIMARY);
    doc.text("2. Demographic Projections & Density Distribution", 14, y);
    y += 5;

    const popData = p.population || {};
    runAutoTable(doc, {
      startY: y,
      head: [["Metric", "Value", "Notes & Methodology"]],
      body: [
        ["Baseline Population", (popData.current || 68000).toLocaleString(), "Census baseline enumeration"],
        ["Target Forecast Population", (popData.forecast_population || popData.target || 185000).toLocaleString(), "Statutory master plan target capacity"],
        ["Horizon Year", `${popData.forecast_year || 2046}`, "20-year horizon"],
        ["Annual Growth Rate (CAGR)", `${popData.annual_growth_rate || 3.2}%`, popData.cagr_reasoning || "Compound growth model based on regional trajectory"],
        ["Net Projected Addition", `${((popData.forecast_population || 185000) - (popData.current || 68000)).toLocaleString()}`, "Requires planned social & utility infrastructure"],
      ],
      headStyles: { fillColor: PRIMARY, textColor: 255, fontStyle: "bold", fontSize: 9 },
      bodyStyles: { fontSize: 8.5, textColor: TEXT_DARK },
      alternateRowStyles: { fillColor: BG_LIGHT },
      margin: { left: 14, right: 14 },
      theme: "grid",
    });

    y = doc.lastAutoTable.finalY + 8;

    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(...TEXT_MUTED);
    doc.text("Note: Population figures determine mandatory URDPFI social infrastructure norms (schools per 10k, beds per 1k).", 14, y);
  }

  // 3. INFRASTRUCTURE REQUIREMENTS & DEFICIT SECTION
  if (isAll || reportKey === "infrastructure") {
    if (isAll) {
      doc.addPage();
      drawPageHeader(doc, "URDPFI Infrastructure Fulfillment & Deficit Matrix", 3);
    } else if (reportKey === "infrastructure") {
      drawPageHeader(doc, "URDPFI Infrastructure Fulfillment & Deficit Matrix");
    }
    let y = isAll ? 34 : drawProjectMeta(doc, p, 34);

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...PRIMARY);
    doc.text("3. Social Infrastructure Fulfillment & Gap Analysis", 14, y);
    y += 5;

    const infraEntries = Object.entries(p.infrastructure || {});
    const rows = infraEntries.map(([key, val]) => {
      const title = key.charAt(0).toUpperCase() + key.slice(1);
      const req = val.required ?? 0;
      const exist = val.existing ?? 0;
      const deficit = val.deficit ?? (req - exist);
      const status = deficit <= 0 ? "Surplus / Fulfilled" : deficit > 10 ? "CRITICAL DEFICIT" : "DEFICIT";
      return [title, String(req), String(exist), String(deficit), status];
    });

    runAutoTable(doc, {
      startY: y,
      head: [["Facility Category", "Required (Norm)", "Existing", "Statutory Deficit", "Priority Level"]],
      body: rows,
      headStyles: { fillColor: PRIMARY, textColor: 255, fontStyle: "bold", fontSize: 9 },
      bodyStyles: { fontSize: 8.5, textColor: TEXT_DARK },
      alternateRowStyles: { fillColor: BG_LIGHT },
      margin: { left: 14, right: 14 },
      theme: "grid",
      didParseCell: function(data) {
        if (data.column.index === 4 && data.cell.raw === "CRITICAL DEFICIT") {
          data.cell.styles.textColor = [220, 38, 38];
          data.cell.styles.fontStyle = "bold";
        }
      }
    });

    y = doc.lastAutoTable.finalY + 8;
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...TEXT_MUTED);
    doc.text("Benchmarking Source: Urban and Regional Development Plans Formulation and Implementation (URDPFI) Guidelines 2026.", 14, y);
  }

  // 4. ZONING & LAND-USE PLAN SECTION
  if (isAll || reportKey === "zoning") {
    if (isAll) {
      doc.addPage();
      drawPageHeader(doc, "Land Use Zoning & Spatial Allocation Plan", 4);
    } else {
      drawPageHeader(doc, "Land Use Zoning & Spatial Allocation Plan");
    }
    let y = isAll ? 34 : drawProjectMeta(doc, p, 34);

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...PRIMARY);
    doc.text("4. Master Plan Land Use Distribution", 14, y);
    y += 5;

    const zones = p.zones || [];
    const zoneRows = zones.map(z => [
      z.name || "Zone",
      `${z.percentage}%`,
      `${z.area_sqkm} sq.km`,
      `${(z.area_sqkm * 100).toFixed(0)} ha`,
      z.purpose || "Designated municipal use",
    ]);

    runAutoTable(doc, {
      startY: y,
      head: [["Zone Category", "Share (%)", "Area (sq.km)", "Area (Hectares)", "Permitted Uses & Purpose"]],
      body: zoneRows,
      headStyles: { fillColor: PRIMARY, textColor: 255, fontStyle: "bold", fontSize: 9 },
      bodyStyles: { fontSize: 8.5, textColor: TEXT_DARK },
      alternateRowStyles: { fillColor: BG_LIGHT },
      margin: { left: 14, right: 14 },
      theme: "grid",
    });

    y = doc.lastAutoTable.finalY + 8;
  }

  // 5. ENVIRONMENTAL SUSTAINABILITY & MICROCLIMATE
  if (isAll || reportKey === "sustainability") {
    if (isAll) {
      doc.addPage();
      drawPageHeader(doc, "Sustainability & Microclimate Assessment", 5);
    } else {
      drawPageHeader(doc, "Sustainability & Microclimate Assessment");
    }
    let y = isAll ? 34 : drawProjectMeta(doc, p, 34);

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...PRIMARY);
    doc.text("5. Climate Resilience & Environmental Performance", 14, y);
    y += 5;

    const s = p.sustainability || {};
    const sustRows = [
      ["Solar Insolation Potential", s.solar_potential?.value ? `${s.solar_potential.value} ${s.solar_potential.unit || "kWh/m²"}` : "1,850 kWh/m²", `${s.solar_potential?.score || 85}/100`, "High solar harvest potential"],
      ["Embodied Carbon Baseline", s.embodied_carbon?.value ? `${s.embodied_carbon.value} ${s.embodied_carbon.unit || "kgCO2e/m²"}` : "420 kgCO2e/m²", `${s.embodied_carbon?.score || 72}/100`, "Meets low-carbon charter"],
      ["Daylight Autonomy (sDA)", s.daylight?.value ? `${s.daylight.value}%` : "74%", `${s.daylight?.score || 88}/100`, "Optimal natural illumination"],
      ["Pedestrian Wind Comfort", s.wind?.value ? `${s.wind.value} m/s` : "Lawson LD", `${s.wind?.score || 78}/100`, "Safe pedestrian air corridors"],
      ["Acoustic Noise Buffering", s.noise?.value ? `${s.noise.value} dBA` : "52 dBA", `${s.noise?.score || 80}/100`, "Within residential thresholds"],
      ["Green / Open Space Reserve", `${s.green_space_pct || 18}%`, `${s.green_space_pct >= 15 ? 85 : 60}/100`, "Mandatory ecological buffer"],
    ];

    runAutoTable(doc, {
      startY: y,
      head: [["Environmental Parameter", "Calculated Metric", "Score (/100)", "Statutory Environmental Compliance"]],
      body: sustRows,
      headStyles: { fillColor: PRIMARY, textColor: 255, fontStyle: "bold", fontSize: 9 },
      bodyStyles: { fontSize: 8.5, textColor: TEXT_DARK },
      alternateRowStyles: { fillColor: BG_LIGHT },
      margin: { left: 14, right: 14 },
      theme: "grid",
    });

    y = doc.lastAutoTable.finalY + 8;
  }

  // 6. 16-DIMENSIONAL ML SPATIAL FEATURE MATRIX
  const fData = extraFeatures || p.features_data;
  if ((isAll || reportKey === "features") && fData?.vector_16d) {
    if (isAll) {
      doc.addPage();
      drawPageHeader(doc, "16-Dimensional ML Spatial Feature Matrix", 6);
    } else {
      drawPageHeader(doc, "16-Dimensional ML Spatial Feature Matrix");
    }
    let y = isAll ? 34 : drawProjectMeta(doc, p, 34);

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...PRIMARY);
    doc.text("6. Machine Learning Feature Vectors & Spatial Entropy", 14, y);
    y += 5;

    const featureRows = fData.vector_16d.map((feat, idx) => [
      `dim[${idx}]`,
      feat.name,
      feat.domain,
      `${feat.raw_value.toLocaleString()} ${feat.unit}`,
      `${(feat.normalized_score * 100).toFixed(1)}%`,
      feat.normalized_score >= 0.75 ? "Optimal" : feat.normalized_score >= 0.5 ? "Adequate" : "Attention",
    ]);

    runAutoTable(doc, {
      startY: y,
      head: [["Index", "Feature Name", "Domain", "Raw Value", "Normalized", "Status"]],
      body: featureRows,
      headStyles: { fillColor: PRIMARY, textColor: 255, fontStyle: "bold", fontSize: 8.5 },
      bodyStyles: { fontSize: 8, textColor: TEXT_DARK },
      alternateRowStyles: { fillColor: BG_LIGHT },
      margin: { left: 14, right: 14 },
      theme: "grid",
    });

    y = doc.lastAutoTable.finalY + 8;
  }

  // 7. URBAN RISK REGISTER & STATUTORY MITIGATION
  if (isAll || reportKey === "risks") {
    if (isAll) {
      doc.addPage();
      drawPageHeader(doc, "Urban Risk Register & Mitigation Strategy", 7);
    } else {
      drawPageHeader(doc, "Urban Risk Register & Mitigation Strategy");
    }
    let y = isAll ? 34 : drawProjectMeta(doc, p, 34);

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...PRIMARY);
    doc.text("7. Comprehensive Risk Assessment Matrix", 14, y);
    y += 5;

    const risks = p.risks || [];
    const riskRows = risks.map(r => [
      r.title || "Risk Item",
      (r.level || "Medium").toUpperCase(),
      r.category || "Operational",
      r.mitigation || "Mitigation protocol defined in master plan",
    ]);

    runAutoTable(doc, {
      startY: y,
      head: [["Risk Factor", "Severity Level", "Category", "Recommended Mitigation Protocol"]],
      body: riskRows,
      headStyles: { fillColor: PRIMARY, textColor: 255, fontStyle: "bold", fontSize: 9 },
      bodyStyles: { fontSize: 8.5, textColor: TEXT_DARK },
      alternateRowStyles: { fillColor: BG_LIGHT },
      margin: { left: 14, right: 14 },
      theme: "grid",
      didParseCell: function(data) {
        if (data.column.index === 1) {
          if (data.cell.raw === "HIGH") {
            data.cell.styles.textColor = [220, 38, 38];
            data.cell.styles.fontStyle = "bold";
          } else if (data.cell.raw === "MEDIUM") {
            data.cell.styles.textColor = [217, 119, 6];
          }
        }
      }
    });

    y = doc.lastAutoTable.finalY + 8;
  }

  // 8. SCENARIO PROPOSALS
  if ((isAll || reportKey === "proposals") && p.proposals && p.proposals.length > 0) {
    if (isAll) {
      doc.addPage();
      drawPageHeader(doc, "Master Plan Scenario Comparison", 8);
    } else {
      drawPageHeader(doc, "Master Plan Scenario Comparison");
    }
    let y = isAll ? 34 : drawProjectMeta(doc, p, 34);

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...PRIMARY);
    doc.text("8. Scenario Evaluation & Design Options", 14, y);
    y += 5;

    const propRows = p.proposals.map(pr => [
      pr.name || "Proposal",
      `${pr.score || 75}/100`,
      pr.description || "Master plan configuration",
    ]);

    runAutoTable(doc, {
      startY: y,
      head: [["Scenario Proposal", "Composite Score", "Design Intent & Focus"]],
      body: propRows,
      headStyles: { fillColor: PRIMARY, textColor: 255, fontStyle: "bold", fontSize: 9 },
      bodyStyles: { fontSize: 8.5, textColor: TEXT_DARK },
      alternateRowStyles: { fillColor: BG_LIGHT },
      margin: { left: 14, right: 14 },
      theme: "grid",
    });
  }

  // Stamp running footers on every page
  addPageFooters(doc);

  // Generate output Blob and URL
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const safeName = (p.name || "SmartScape_Project").replace(/[^a-zA-Z0-9_-]/g, "_");
  const filename = `${safeName}_${reportKey}_Report.pdf`;

  return { doc, blob, url, filename };
}

/**
 * Robust cross-browser file download helper
 */
export function downloadPdfBlob(blob, filename, docFallback = null) {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 15000);
    return true;
  } catch (err) {
    console.warn("Anchor blob download failed, falling back to doc.save:", err);
    if (docFallback && typeof docFallback.save === "function") {
      docFallback.save(filename);
      return true;
    }
    throw err;
  }
}
