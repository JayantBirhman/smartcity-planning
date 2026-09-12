import React, { useRef, useEffect, useState, useCallback } from "react";
import { RotateCcw, ZoomIn, ZoomOut, Sun, Wind, Layers, ShieldCheck } from "lucide-react";

export default function FormaCanvas3D({
  parcels = [],
  selectedParcelId = null,
  onSelectParcel = () => {},
  timeOfDay = 12.0,
  windDirection = 245.0,
  windSpeed = 4.5,
  colorMode = "zoning",
  densityFactor = 1.0,
  className = ""
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const [rotation, setRotation] = useState(Math.PI / 4.2);
  const [pitch, setPitch] = useState(0.62);
  const [zoom, setZoom] = useState(1.0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hoveredParcel, setHoveredParcel] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const isDraggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const animFrameRef = useRef(null);
  const windParticlesRef = useRef([]);

  // Initialize wind particles
  useEffect(() => {
    const pts = [];
    for (let i = 0; i < 48; i++) {
      pts.push({
        x: (Math.random() - 0.5) * 600,
        y: (Math.random() - 0.5) * 600,
        speed: 0.8 + Math.random() * 0.8,
        life: Math.random() * 100,
        maxLife: 80 + Math.random() * 60,
      });
    }
    windParticlesRef.current = pts;
  }, []);

  // Compute bounding box of parcels in local coordinates
  const bounds = React.useMemo(() => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    if (!parcels || parcels.length === 0) {
      return { cx: 0, cy: 0, span: 400 };
    }
    for (const p of parcels) {
      for (const [x, y] of (p.local_coords || [])) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (minX === Infinity) return { cx: 0, cy: 0, span: 400 };
    return {
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
      span: Math.max(maxX - minX, maxY - minY, 100)
    };
  }, [parcels]);

  // Color mapper based on colorMode
  const getParcelColor = useCallback((p, isTop = false, normalShade = 1.0) => {
    let baseHex = p.color || "#0284C7";

    if (colorMode === "solar") {
      const sunHours = p.annual_solar_pv_mwh ? Math.min(10, 4 + p.annual_solar_pv_mwh / 1000) : 7.2;
      if (sunHours > 8.0) baseHex = "#F59E0B"; // bright solar amber
      else if (sunHours > 6.5) baseHex = "#EAB308"; // warm gold
      else if (sunHours > 5.0) baseHex = "#38BDF8"; // sky blue
      else baseHex = "#6366F1"; // shaded indigo
    } else if (colorMode === "wind") {
      const comfort = p.lawson_wind_comfort || "Grade A";
      if (comfort.includes("Grade A")) baseHex = "#059669"; // peaceful sitting green
      else if (comfort.includes("Grade B")) baseHex = "#10B981"; // standing emerald
      else if (comfort.includes("Grade C")) baseHex = "#F59E0B"; // strolling amber
      else if (comfort.includes("Grade D")) baseHex = "#F97316"; // business orange
      else baseHex = "#EF4444"; // uncomfortable red
    } else if (colorMode === "carbon") {
      const carbon = p.embodied_carbon_tonnes || 50;
      if (p.zone_type === "parks_green") baseHex = "#10B981";
      else if (carbon < 40) baseHex = "#059669";
      else if (carbon < 90) baseHex = "#0284C7";
      else if (carbon < 150) baseHex = "#F59E0B";
      else baseHex = "#EF4444";
    }

    // Convert hex to rgb for lighting
    const r = parseInt(baseHex.slice(1, 3), 16) || 2;
    const g = parseInt(baseHex.slice(3, 5), 16) || 132;
    const b = parseInt(baseHex.slice(5, 7), 16) || 199;

    const factor = isTop ? normalShade * 1.15 : normalShade;
    const clampedR = Math.min(255, Math.max(0, Math.round(r * factor)));
    const clampedG = Math.min(255, Math.max(0, Math.round(g * factor)));
    const clampedB = Math.min(255, Math.max(0, Math.round(b * factor)));

    return `rgb(${clampedR}, ${clampedG}, ${clampedB})`;
  }, [colorMode]);

  // Main Render Loop
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    // Coordinate projection math
    const baseScale = (Math.min(width, height) / (bounds.span * 1.4)) * zoom;
    const centerX = width / 2 + pan.x;
    const centerY = height / 2 + pan.y + 20;

    const cosR = Math.cos(rotation);
    const sinR = Math.sin(rotation);
    const sinP = Math.sin(pitch);
    const cosP = Math.cos(pitch);

    const project = (x, y, z) => {
      const rx = (x - bounds.cx) * cosR - (y - bounds.cy) * sinR;
      const ry = (x - bounds.cx) * sinR + (y - bounds.cy) * cosR;
      const sx = centerX + rx * baseScale;
      const sy = centerY + (ry * sinP - z * cosP) * baseScale;
      return { sx, sy, depth: ry };
    };

    // 1. Draw Ground Blueprint Grid
    ctx.save();
    ctx.strokeStyle = "rgba(148, 163, 184, 0.22)";
    ctx.lineWidth = 1;
    const gridSpan = bounds.span * 0.9;
    const step = bounds.span / 8;
    for (let gx = -gridSpan; gx <= gridSpan; gx += step) {
      const p1 = project(bounds.cx + gx, bounds.cy - gridSpan, 0);
      const p2 = project(bounds.cx + gx, bounds.cy + gridSpan, 0);
      ctx.beginPath();
      ctx.moveTo(p1.sx, p1.sy);
      ctx.lineTo(p2.sx, p2.sy);
      ctx.stroke();
    }
    for (let gy = -gridSpan; gy <= gridSpan; gy += step) {
      const p1 = project(bounds.cx - gridSpan, bounds.cy + gy, 0);
      const p2 = project(bounds.cx + gridSpan, bounds.cy + gy, 0);
      ctx.beginPath();
      ctx.moveTo(p1.sx, p1.sy);
      ctx.lineTo(p2.sx, p2.sy);
      ctx.stroke();
    }
    ctx.restore();

    // 2. Solar Direction & Sun Shadow Calculation
    const sunNormalized = (timeOfDay - 6) / 12; // 0 at 6am, 0.5 at 12pm, 1.0 at 6pm
    const sunAlt = Math.max(0.2, Math.sin(sunNormalized * Math.PI) * 1.2);
    const sunAz = sunNormalized * Math.PI; // East to West
    const shadowDistMult = 1.0 / Math.tan(sunAlt);
    const shadowOffX = -Math.cos(sunAz) * shadowDistMult;
    const shadowOffY = -Math.sin(sunAz) * shadowDistMult;

    // Draw Shadows first (under all buildings)
    ctx.save();
    ctx.fillStyle = "rgba(15, 23, 42, 0.16)";
    for (const p of parcels) {
      const h = (p.height_m || 15) * densityFactor;
      const coords = p.local_coords || [];
      if (coords.length < 3) continue;

      ctx.beginPath();
      coords.forEach(([x, y], idx) => {
        const sx = x + shadowOffX * h * 0.35;
        const sy = y + shadowOffY * h * 0.35;
        const pt = project(sx, sy, 0);
        if (idx === 0) ctx.moveTo(pt.sx, pt.sy);
        else ctx.lineTo(pt.sx, pt.sy);
      });
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // 3. Sort Parcels by depth (Painter's algorithm: draw farthest back first)
    const sortedParcels = [...parcels].map((p) => {
      const coords = p.local_coords || [];
      let avgDepth = 0;
      coords.forEach(([x, y]) => {
        const pt = project(x, y, 0);
        avgDepth += pt.depth;
      });
      avgDepth = coords.length ? avgDepth / coords.length : 0;
      return { ...p, avgDepth };
    }).sort((a, b) => a.avgDepth - b.avgDepth);

    // 4. Render 3D Extruded Buildings
    for (const p of sortedParcels) {
      const coords = p.local_coords || [];
      if (coords.length < 3) continue;

      const n = coords[0][0] === coords[coords.length - 1][0] && coords[0][1] === coords[coords.length - 1][1]
        ? coords.length - 1
        : coords.length;

      const isSelected = p.id === selectedParcelId;
      const isHovered = p.id === hoveredParcel?.id;
      const h = (p.height_m || 15) * densityFactor;
      const stories = Math.max(1, Math.round((p.stories || 5) * densityFactor));

      // Calculate project screen points for base and top
      const basePts = [];
      const topPts = [];
      for (let i = 0; i < n; i++) {
        const [x, y] = coords[i];
        basePts.push(project(x, y, 0));
        topPts.push(project(x, y, h));
      }

      // Draw lateral walls
      for (let i = 0; i < n; i++) {
        const next_i = (i + 1) % n;
        const b1 = basePts[i];
        const b2 = basePts[next_i];
        const t2 = topPts[next_i];
        const t1 = topPts[i];

        // Wall normal vector in local space
        const dx = coords[next_i][0] - coords[i][0];
        const dy = coords[next_i][1] - coords[i][1];
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx = dy / len;
        const ny = -dx / len;

        // Sunlight dot product
        const sunX = Math.cos(sunAz);
        const sunY = Math.sin(sunAz);
        const lightDot = nx * sunX + ny * sunY;
        const shade = Math.min(1.15, Math.max(0.48, 0.72 + 0.35 * lightDot));

        ctx.beginPath();
        ctx.moveTo(b1.sx, b1.sy);
        ctx.lineTo(b2.sx, b2.sy);
        ctx.lineTo(t2.sx, t2.sy);
        ctx.lineTo(t1.sx, t1.sy);
        ctx.closePath();

        ctx.fillStyle = getParcelColor(p, false, shade);
        ctx.fill();

        ctx.strokeStyle = isSelected
          ? "#0284C7"
          : isHovered
            ? "#38BDF8"
            : "rgba(15, 23, 42, 0.28)";
        ctx.lineWidth = isSelected ? 2.2 : 0.8;
        ctx.stroke();

        // Floor division bands
        if (stories > 1 && h > 6) {
          ctx.save();
          ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
          ctx.lineWidth = 0.6;
          for (let s = 1; s < stories; s++) {
            const zh = (h / stories) * s;
            const floorPt1 = project(coords[i][0], coords[i][1], zh);
            const floorPt2 = project(coords[next_i][0], coords[next_i][1], zh);
            ctx.beginPath();
            ctx.moveTo(floorPt1.sx, floorPt1.sy);
            ctx.lineTo(floorPt2.sx, floorPt2.sy);
            ctx.stroke();
          }
          ctx.restore();
        }
      }

      // Draw Roof Cap Face
      ctx.beginPath();
      topPts.forEach((pt, idx) => {
        if (idx === 0) ctx.moveTo(pt.sx, pt.sy);
        else ctx.lineTo(pt.sx, pt.sy);
      });
      ctx.closePath();

      ctx.fillStyle = getParcelColor(p, true, 1.05);
      ctx.fill();

      ctx.strokeStyle = isSelected
        ? "#0284C7"
        : isHovered
          ? "#38BDF8"
          : "rgba(15, 23, 42, 0.4)";
      ctx.lineWidth = isSelected ? 2.5 : 1.0;
      ctx.stroke();

      // Rooftop solar PV or garden accent on roof cap
      if (p.zone_type !== "parks_green" && p.annual_solar_pv_mwh > 0) {
        ctx.save();
        ctx.fillStyle = "rgba(30, 41, 59, 0.3)";
        ctx.fill();
        ctx.restore();
      }

      // Selected Pin & Tag Indicator
      if (isSelected || isHovered) {
        const topCenter = topPts.reduce(
          (acc, pt) => ({ sx: acc.sx + pt.sx / topPts.length, sy: acc.sy + pt.sy / topPts.length }),
          { sx: 0, sy: 0 }
        );

        ctx.save();
        ctx.shadowColor = "rgba(2, 132, 199, 0.5)";
        ctx.shadowBlur = 12;
        ctx.fillStyle = "#0284C7";
        ctx.beginPath();
        ctx.arc(topCenter.sx, topCenter.sy - 12, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(topCenter.sx, topCenter.sy);
        ctx.lineTo(topCenter.sx, topCenter.sy - 8);
        ctx.stroke();
        ctx.restore();
      }
    }

    // 5. Animated Wind Vector Streamlines
    ctx.save();
    const windRad = (windDirection * Math.PI) / 180;
    const wDx = -Math.sin(windRad);
    const wDy = -Math.cos(windRad);

    windParticlesRef.current.forEach((particle) => {
      particle.x += wDx * particle.speed * (windSpeed / 3.0);
      particle.y += wDy * particle.speed * (windSpeed / 3.0);
      particle.life += 1;

      if (particle.life > particle.maxLife || Math.abs(particle.x) > 350 || Math.abs(particle.y) > 350) {
        particle.x = (Math.random() - 0.5) * 600 - wDx * 250;
        particle.y = (Math.random() - 0.5) * 600 - wDy * 250;
        particle.life = 0;
      }

      const pStart = project(bounds.cx + particle.x, bounds.cy + particle.y, 4);
      const tailLen = 14 * (windSpeed / 3.5);
      const pEnd = project(
        bounds.cx + particle.x + wDx * tailLen,
        bounds.cy + particle.y + wDy * tailLen,
        4
      );

      const alpha = Math.sin((particle.life / particle.maxLife) * Math.PI) * 0.55;
      ctx.strokeStyle = `rgba(2, 132, 199, ${alpha})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(pStart.sx, pStart.sy);
      ctx.lineTo(pEnd.sx, pEnd.sy);
      ctx.stroke();
    });
    ctx.restore();

  }, [parcels, selectedParcelId, hoveredParcel, rotation, pitch, zoom, pan, bounds, timeOfDay, windDirection, windSpeed, densityFactor, getParcelColor]);

  // Animation ticker for wind particles
  useEffect(() => {
    let active = true;
    const loop = () => {
      if (!active) return;
      render();
      animFrameRef.current = requestAnimationFrame(loop);
    };
    animFrameRef.current = requestAnimationFrame(loop);
    return () => {
      active = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [render]);

  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (container && canvas) {
        const rect = container.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
        render();
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [render]);

  // Mouse drag / Orbit / Pan handlers
  const onMouseDown = (e) => {
    isDraggingRef.current = true;
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
  };

  const onMouseMove = (e) => {
    if (isDraggingRef.current) {
      const dx = e.clientX - lastMouseRef.current.x;
      const dy = e.clientY - lastMouseRef.current.y;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };

      if (e.shiftKey || e.button === 2) {
        // Pan
        setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      } else {
        // Rotate Orbit & Pitch
        setRotation((prev) => (prev + dx * 0.007) % (Math.PI * 2));
        setPitch((prev) => Math.min(1.25, Math.max(0.2, prev - dy * 0.005)));
      }
    } else {
      // Hover hit detection
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      let found = null;
      for (const p of parcels) {
        const coords = p.local_coords || [];
        if (coords.length < 3) continue;

        const cosR = Math.cos(rotation);
        const sinR = Math.sin(rotation);
        const sinP = Math.sin(pitch);
        const cosP = Math.cos(pitch);
        const baseScale = (Math.min(canvas.width, canvas.height) / (bounds.span * 1.4)) * zoom;
        const centerX = canvas.width / 2 + pan.x;
        const centerY = canvas.height / 2 + pan.y + 20;

        const h = (p.height_m || 15) * densityFactor;
        const topPts = coords.map(([x, y]) => {
          const rx = (x - bounds.cx) * cosR - (y - bounds.cy) * sinR;
          const ry = (x - bounds.cx) * sinR + (y - bounds.cy) * cosR;
          return {
            x: centerX + rx * baseScale,
            y: centerY + (ry * sinP - h * cosP) * baseScale,
          };
        });

        // Point-in-polygon test for roof
        if (pointInPolygon({ x: mouseX, y: mouseY }, topPts)) {
          found = p;
          break;
        }
      }

      setHoveredParcel(found);
      if (found) {
        setTooltipPos({ x: e.clientX, y: e.clientY });
      }
    }
  };

  const onMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleClick = () => {
    if (hoveredParcel) {
      onSelectParcel(hoveredParcel);
    }
  };

  const onWheel = (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.08 : 0.92;
    setZoom((prev) => Math.min(3.2, Math.max(0.45, prev * factor)));
  };

  const resetView = () => {
    setRotation(Math.PI / 4.2);
    setPitch(0.62);
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-[460px] lg:h-[560px] bg-gradient-to-b from-slate-900 via-[#0B132B] to-slate-950 rounded-xl overflow-hidden border border-slate-800 shadow-2xl select-none ${className}`}
    >
      <canvas
        ref={canvasRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onClick={handleClick}
        onWheel={onWheel}
        className="w-full h-full cursor-grab active:cursor-grabbing block"
      />

      {/* Floating Canvas Badges */}
      <div className="absolute top-4 left-4 flex flex-wrap items-center gap-2 pointer-events-none">
        <div className="px-3 py-1.5 rounded-md bg-slate-900/80 backdrop-blur-md border border-slate-700/60 text-xs font-semibold text-white flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          Autodesk Forma · 3D Conceptual Massing Engine
        </div>
        <div className="px-2.5 py-1.5 rounded-md bg-slate-900/80 backdrop-blur-md border border-slate-700/60 text-[11px] text-slate-300">
          Scale: {Math.round(zoom * 100)}% · Density: {densityFactor.toFixed(1)}x
        </div>
      </div>

      {/* Camera Controls Overlay */}
      <div className="absolute bottom-4 right-4 flex items-center gap-1.5 bg-slate-900/85 backdrop-blur-md border border-slate-700/70 p-1 rounded-lg text-slate-300 shadow-lg">
        <button
          onClick={() => setZoom((z) => Math.min(3.2, z * 1.15))}
          title="Zoom In"
          className="p-1.5 hover:bg-slate-800 rounded hover:text-white transition-colors"
        >
          <ZoomIn size={15} />
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(0.45, z * 0.85))}
          title="Zoom Out"
          className="p-1.5 hover:bg-slate-800 rounded hover:text-white transition-colors"
        >
          <ZoomOut size={15} />
        </button>
        <div className="w-[1px] h-4 bg-slate-700 my-auto" />
        <button
          onClick={resetView}
          title="Reset Camera"
          className="p-1.5 hover:bg-slate-800 rounded hover:text-white transition-colors"
        >
          <RotateCcw size={15} />
        </button>
      </div>

      {/* Mode legend indicator */}
      <div className="absolute bottom-4 left-4 bg-slate-900/85 backdrop-blur-md border border-slate-700/70 px-3 py-2 rounded-lg text-xs text-slate-300 shadow-lg pointer-events-none max-w-sm">
        <div className="font-semibold text-white uppercase text-[10px] tracking-wider mb-1">
          {colorMode === "zoning" && "Land Use Zoning Massing"}
          {colorMode === "solar" && "Solar Insolation Exposure"}
          {colorMode === "wind" && "Lawson Wind Comfort Streamlines"}
          {colorMode === "carbon" && "Embodied Carbon Typology"}
        </div>
        <div className="text-[11px] text-slate-400">
          Click & drag to orbit 360° · Scroll to zoom · Click building parcel to inspect
        </div>
      </div>

      {/* Hover Parcel Tooltip */}
      {hoveredParcel && (
        <div
          className="pointer-events-none fixed z-50 px-3 py-2 rounded-lg bg-slate-900/95 backdrop-blur-md border border-sky-500/50 text-white shadow-xl text-xs -translate-x-1/2 -translate-y-full -mt-3 transition-opacity"
          style={{ left: tooltipPos.x, top: tooltipPos.y }}
        >
          <div className="font-bold text-sky-400">{hoveredParcel.zone_name}</div>
          <div className="text-slate-300 text-[11px]">{hoveredParcel.typology}</div>
          <div className="flex items-center gap-3 mt-1 pt-1 border-t border-slate-800 text-[11px]">
            <span><strong>FAR:</strong> {hoveredParcel.far}</span>
            <span><strong>Stories:</strong> G+{hoveredParcel.stories}</span>
            <span><strong>Height:</strong> {hoveredParcel.height_m}m</span>
          </div>
        </div>
      )}
    </div>
  );
}

function pointInPolygon(point, vs) {
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i].x, yi = vs[i].y;
    const xj = vs[j].x, yj = vs[j].y;
    const intersect = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
