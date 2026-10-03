// Farm fields outside the floor-1 walls (pure data, no scene code), so the
// terrain shader, grass/tree scattering and the wheat shader agree on them.
// Field: centre (x,z), yaw, half extents hw (across) / hd (along), crop type.
export const CROP = { none: 0, wheat: 1, veg: 2, plowed: 3 };

function cluster(cx, cz, cols, rows, hw, hd, gap, crops) {
  const yaw = Math.atan2(cx, cz); // long axis points away from town
  const rx = Math.sin(yaw), rz = Math.cos(yaw); // radial
  const tx = Math.cos(yaw), tz = -Math.sin(yaw); // tangential
  const out = [];
  let k = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const dt = (c - (cols - 1) / 2) * (hw * 2 + gap);
      const dr = (r - (rows - 1) / 2) * (hd * 2 + gap);
      out.push({ x: cx + tx * dt + rx * dr, z: cz + tz * dt + rz * dr, yaw, hw, hd, crop: crops[k++ % crops.length] });
    }
  }
  return { cx, cz, yaw, rx, rz, tx, tz, fields: out };
}

export const FARM_CLUSTERS = [
  cluster(118, -120, 3, 2, 13.5, 10, 4.5, [CROP.wheat, CROP.wheat, CROP.veg, CROP.wheat, CROP.plowed, CROP.wheat]),
  cluster(-122, -116, 2, 2, 13, 10, 4.5, [CROP.wheat, CROP.veg, CROP.wheat, CROP.wheat]),
];
export const FIELDS = FARM_CLUSTERS.flatMap((c) => c.fields);

// crop type at a point (0 = none); `pad` grows the fields (for keep-outs)
export function fieldAt(x, z, pad = 0, fields = FIELDS) {
  for (const f of fields) {
    const dx = x - f.x, dz = z - f.z;
    const c = Math.cos(f.yaw), s = Math.sin(f.yaw);
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    if (Math.abs(lx) < f.hw + pad && Math.abs(lz) < f.hd + pad) return f.crop;
  }
  return 0;
}

// distance-ish test used to switch the GPU wheat on only near the farms
export function nearFarms(x, z, r, fields = FIELDS) {
  for (const f of fields) if (Math.hypot(x - f.x, z - f.z) < r + Math.max(f.hw, f.hd)) return true;
  return false;
}
