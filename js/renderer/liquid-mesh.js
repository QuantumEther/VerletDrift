// Shared procedural liquid topology. Positions remain GPU analytic.
export function makeSheetMesh(angular = 160, radial = 18) {
  const vertices = new Float32Array((angular + 1) * (radial + 1) * 2);
  const indices = new Uint32Array(angular * radial * 6);
  let v = 0,
    i = 0;
  for (let a = 0; a <= angular; a++)
    for (let r = 0; r <= radial; r++) {
      vertices[v++] = a / angular;
      vertices[v++] = r / radial;
    }
  for (let a = 0; a < angular; a++)
    for (let r = 0; r < radial; r++) {
      const p = a * (radial + 1) + r,
        q = p + radial + 1;
      indices.set([p, q, p + 1, p + 1, q, q + 1], i);
      i += 6;
    }
  return { vertices, indices };
}
export function makeStrandMesh(segments = 36) {
  const vertices = new Float32Array((segments + 1) * 4),
    indices = new Uint32Array(segments * 6);
  for (let i = 0; i <= segments; i++)
    vertices.set([i / segments, -1, i / segments, 1], i * 4);
  for (let i = 0; i < segments; i++)
    indices.set(
      [i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 2, i * 2 + 1, i * 2 + 3],
      i * 6,
    );
  return { vertices, indices };
}
