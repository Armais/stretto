"""Generador de los coches de Stretto en Blender (se ejecuta dentro de Blender):

    exec(open(r"<repo>/tools/blender/vehiculos.py", encoding="utf-8").read())
    construir("muscle")      # crea la escena, guarda el .blend y exporta public/models/muscle.glb

Cada coche es una carrocería hecha con secciones transversales unidas y suavizadas (con
pliegues en cintura, marco de ventanas y bajos), ruedas con llanta de cinco radios, pasos de
rueda recortados y detalles colocados lanzando rayos contra la carrocería. Delante = +Y en
Blender, que el exportador glTF convierte en -Z (hacia delante en el juego).
"""

import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

REPO = r"C:\Users\adiaz\NuevasIdeasJuegosApps\Juegos\JamGameOff2026Itchio"


# ---------------------------------------------------------------- materiales

def material(name, color, metallic=0.0, rough=0.5, coat=0.0, emit=None, emit_strength=0.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    b = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    ins = b.inputs
    ins["Base Color"].default_value = (*color, 1)
    ins["Metallic"].default_value = metallic
    ins["Roughness"].default_value = rough
    if "Coat Weight" in ins:
        ins["Coat Weight"].default_value = coat
    if emit:
        ins["Emission Color"].default_value = (*emit, 1)
        ins["Emission Strength"].default_value = emit_strength
    mat.diffuse_color = (*color, 1)
    return mat


def comunes():
    return {
        "cristal": material("st_cristal", (0.015, 0.02, 0.025), 0.4, 0.05),
        "techo": material("st_techo", (0.012, 0.012, 0.014), 0.35, 0.12, coat=1.0),
        "plastico": material("st_plastico", (0.018, 0.018, 0.02), 0.0, 0.6),
        "cromo": material("st_cromo", (0.85, 0.85, 0.85), 1.0, 0.12),
        "luz_roja": material("st_luz_roja", (0.6, 0.02, 0.03), 0.0, 0.3, emit=(1.0, 0.04, 0.06), emit_strength=6.0),
        "luz_blanca": material("st_luz_blanca", (0.9, 0.92, 1.0), 0.0, 0.2, emit=(1.0, 0.97, 0.92), emit_strength=5.0),
        "neumatico": material("st_neumatico", (0.022, 0.022, 0.024), 0.0, 0.85),
        "llanta": material("st_llanta", (0.16, 0.16, 0.17), 1.0, 0.28),
    }


# ---------------------------------------------------------------- carrocería

def perfil(w, z0, zb, zr, forma):
    """Media sección: del centro de abajo, por el lateral, hasta el centro del techo."""
    h = zb - z0
    tuck = forma.get("tuck", 0.985)
    pts = [(0, z0), (w * 0.86, z0), (w * 0.96, z0 + 0.05), (w * tuck, z0 + 0.30 * h), (w, z0 + 0.62 * h),
           (w * 0.985, zb - 0.04), (w * 0.95, zb)]
    if zr - zb > 0.05:
        g = zr - zb
        top = forma.get("roof_w", 0.62)
        pts += [(w * 0.86, zb + 0.10 * g), (w * (top + 0.12), zr - 0.10 * g), (w * top, zr - 0.01), (w * top * 0.5, zr), (0, zr)]
    else:
        pts += [(w * 0.90, zb + 0.015), (w * 0.75, zb + 0.03), (w * 0.55, zb + 0.04), (w * 0.28, zb + 0.045), (0, zb + 0.045)]
    return pts


def carroceria(scn, coll, nombre, largo, secciones, mats, forma):
    """`forma`: rangos de t para parabrisas, techo y luneta, y si el techo es negro."""
    HALF = 12
    N = HALF * 2 - 2
    R = len(secciones)
    verts, faces, mat_idx = [], [], []
    for (t, w, z0, zb, zr) in secciones:
        hp = perfil(w, z0, zb, zr, forma)
        full = hp + [(-x, z) for (x, z) in reversed(hp[1:-1])]
        verts += [(x, largo / 2 - largo * t, z) for (x, z) in full]
    ws, roof, rear = forma["parabrisas"], forma["techo"], forma["luneta"]
    for k in range(R - 1):
        tm = (secciones[k][0] + secciones[k + 1][0]) / 2
        for i in range(N):
            faces.append((k * N + i, k * N + (i + 1) % N, (k + 1) * N + (i + 1) % N, (k + 1) * N + i))
            j = i if i < HALF - 1 else (N - 1 - i)
            m = 0
            if j in (0, 1, 2):
                m = 3
            elif (ws[0] <= tm <= ws[1] or rear[0] < tm <= rear[1]) and j in (7, 8, 9, 10):
                m = 1
            elif roof[0] < tm <= roof[1] and j == 7:
                m = 1
            elif roof[0] < tm <= roof[1] and j in (8, 9, 10):
                m = 2 if forma.get("techo_negro") else 0
            mat_idx.append(m)
    faces.append(tuple(range(N)))
    faces.append(tuple(reversed(range((R - 1) * N, R * N))))
    mat_idx += [0, 0]
    me = bpy.data.meshes.new(nombre)
    me.from_pydata(verts, [], faces)
    me.update()
    for p, m in zip(me.polygons, mat_idx):
        p.material_index = m
    attr = me.attributes.new("crease_edge", "FLOAT", "EDGE")
    eidx = {tuple(sorted(e.vertices)): e.index for e in me.edges}
    base = forma.get("pliegue", 1.0)
    creases = {2: 0.6 * base, 6: 0.85 * base, 8: 0.7 * base}
    creases.update({N - i: c for i, c in creases.items()})
    for k in range(R - 1):
        for i, c in creases.items():
            e = eidx.get(tuple(sorted((k * N + i, (k + 1) * N + i))))
            if e is not None:
                attr.data[e].value = min(1.0, c)
    for k, c in ((R - 2, forma.get("canto_trasero", 0.5)), (1, 0.35)):
        for i in range(N):
            e = eidx.get(tuple(sorted((k * N + i, k * N + (i + 1) % N))))
            if e is not None:
                attr.data[e].value = max(attr.data[e].value, c)
    for key in ("pintura", "cristal", "techo", "plastico"):
        me.materials.append(mats[key])
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(nombre, me)
    coll.objects.link(ob)
    sub = ob.modifiers.new("Subsurf", "SUBSURF")
    sub.levels = sub.render_levels = forma.get("subsurf", 2)
    return ob


def rueda(coll, nombre, mats, radio, ancho, lado):
    bm = bmesh.new()

    def cil(r, depth, segs, x0, mat):
        g = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r, radius2=r, depth=depth,
                                  matrix=Matrix.Translation((x0, 0, 0)) @ Matrix.Rotation(math.pi / 2, 4, "Y"))
        for f in {f for v in g["verts"] for f in v.link_faces}:
            f.material_index = mat

    cil(radio, ancho, 40, 0.0, 0)
    cil(radio * 0.72, ancho + 0.004, 40, 0.0, 1)
    cil(0.07, 0.04, 16, ancho / 2 + 0.01, 1)
    for s in range(5):
        g = bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Rotation(s * 2 * math.pi / 5, 4, "X")
                                  @ Matrix.Translation((ancho / 2 + 0.004, 0, 0)) @ Matrix.Diagonal((0.035, 0.07, radio * 1.24, 1)))
        for f in {f for v in g["verts"] for f in v.link_faces}:
            f.material_index = 1
    me = bpy.data.meshes.new(nombre)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mats["neumatico"])
    me.materials.append(mats["llanta"])
    if lado < 0:
        me.transform(Matrix.Diagonal((-1, 1, 1, 1)))
        me.flip_normals()
    ob = bpy.data.objects.new(nombre, me)
    coll.objects.link(ob)
    return ob


def ruedas_y_pasos(scn, coll, cortes, body, mats, ejes):
    """`ejes`: lista de (prefijo, y, radio, ancho, via)."""
    cb = bmesh.new()
    for pref, y, r, ancho, via in ejes:
        for lado, sx in (("I", -1), ("D", 1)):
            rueda(coll, f"rueda_{pref}{lado}", mats, r, ancho, sx).location = (sx * via, y, r)
            bmesh.ops.create_cone(cb, cap_ends=True, segments=40, radius1=r + 0.08, radius2=r + 0.08, depth=0.6,
                                  matrix=Matrix.Translation((sx * (via + 0.18), y, r + 0.02)) @ Matrix.Rotation(math.pi / 2, 4, "Y"))
    cm = bpy.data.meshes.new(f"corte_{body.name}")
    cb.to_mesh(cm)
    cb.free()
    cm.materials.append(mats["plastico"])
    cut = bpy.data.objects.new(f"corte_{body.name}", cm)
    cortes.objects.link(cut)
    cut.hide_viewport = cut.hide_render = True
    bo = body.modifiers.new("Pasos", "BOOLEAN")
    bo.operation = "DIFFERENCE"
    bo.solver = "EXACT"
    bo.object = cut
    if hasattr(bo, "material_mode"):
        bo.material_mode = "TRANSFER"


class Detalles:
    """Piezas sueltas agrupadas por material, apoyadas en la carrocería con rayos."""

    def __init__(self, body):
        dg = bpy.context.evaluated_depsgraph_get()
        self.ev = body.evaluated_get(dg)
        self.parts = {}

    def hit(self, x, z, delante):
        o = Vector((x, 4.0 if delante else -4.0, z))
        d = Vector((0, -1 if delante else 1, 0))
        ok, loc, _, _ = self.ev.ray_cast(o, d)
        return loc if ok else None

    def top(self, y):
        ok, loc, _, _ = self.ev.ray_cast(Vector((0, y, 4.0)), Vector((0, 0, -1)))
        return loc if ok else None

    def bm(self, mat):
        if mat not in self.parts:
            self.parts[mat] = bmesh.new()
        return self.parts[mat]

    def caja(self, mat, centro, tam, rot=Matrix.Identity(4)):
        bmesh.ops.create_cube(self.bm(mat), size=1.0, matrix=Matrix.Translation(centro) @ rot @ Matrix.Diagonal((*tam, 1)))

    def cil_y(self, mat, centro, r, largo, segs=20):
        bmesh.ops.create_cone(self.bm(mat), cap_ends=True, segments=segs, radius1=r, radius2=r, depth=largo,
                              matrix=Matrix.Translation(centro) @ Matrix.Rotation(math.pi / 2, 4, "X"))

    def tira(self, mat, xs, z, alto, fondo, delante, fuera):
        pts = [p + Vector((0, fuera, 0)) for p in (self.hit(x, z, delante) for x in xs) if p is not None]
        for a, b in zip(pts, pts[1:]):
            d = b - a
            self.caja(mat, (a + b) / 2, (d.length + 0.004, fondo, alto), Matrix.Rotation(math.atan2(d.y, d.x), 4, "Z"))

    def crear(self, coll):
        for mat, bm in self.parts.items():
            m = bpy.data.meshes.new(f"det_{mat}")
            bm.to_mesh(m)
            bm.free()
            m.materials.append(bpy.data.materials[mat])
            coll.objects.link(bpy.data.objects.new(f"det_{mat}", m))


# ---------------------------------------------------------------- coches

def muscle(scn, coll, cortes):
    mats = comunes()
    mats["pintura"] = material("st_pintura_muscle", (0.32, 0.015, 0.02), 0.5, 0.25, coat=1.0)
    L = 4.85
    S = [
        (0.000, 0.80, 0.30, 0.60, 0.60), (0.010, 0.93, 0.22, 0.68, 0.68), (0.050, 0.97, 0.20, 0.76, 0.76),
        (0.200, 0.99, 0.20, 0.83, 0.83), (0.380, 0.99, 0.20, 0.88, 0.90), (0.420, 0.99, 0.20, 0.89, 0.97),
        (0.550, 0.97, 0.20, 0.92, 1.33), (0.680, 0.97, 0.20, 0.94, 1.35), (0.760, 0.99, 0.20, 0.96, 1.24),
        (0.860, 1.00, 0.20, 0.98, 1.02), (0.960, 0.99, 0.21, 1.00, 1.01), (0.985, 0.96, 0.24, 0.98, 0.98),
        (1.000, 0.86, 0.32, 0.93, 0.93),
    ]
    forma = {"parabrisas": (0.42, 0.55), "techo": (0.55, 0.76), "luneta": (0.76, 0.86), "roof_w": 0.66, "canto_trasero": 0.7}
    body = carroceria(scn, coll, "carroceria", L, S, mats, forma)
    ruedas_y_pasos(scn, coll, cortes, body, mats, [("D", 1.55, 0.35, 0.27, 0.83), ("T", -1.45, 0.37, 0.33, 0.83)])
    d = Detalles(body)
    for sx in (-1, 1):  # dos pilotos rectangulares grandes con panel negro entre ellos
        d.tira("st_luz_roja", [sx * (0.30 + i * 0.05) for i in range(11)], 0.86, 0.11, 0.03, False, -0.005)
    d.tira("st_plastico", [x / 20 for x in range(-6, 7)], 0.86, 0.11, 0.025, False, -0.003)
    p = d.hit(0, 0.55, False)
    d.caja("st_plastico", p + Vector((0, -0.01, 0)), (0.54, 0.03, 0.14))
    p = d.hit(0, 0.28, False)
    d.caja("st_plastico", p + Vector((0, -0.02, -0.03)), (1.5, 0.08, 0.12))
    for ex in (-0.68, -0.52, 0.52, 0.68):  # cuatro escapes
        d.cil_y("st_cromo", Vector((ex, p.y - 0.05, 0.27)), 0.05, 0.16)
        d.cil_y("st_plastico", Vector((ex, p.y - 0.125, 0.27)), 0.038, 0.02)
    for sx in (-1, 1):
        d.tira("st_luz_blanca", [sx * (0.48 + i * 0.04) for i in range(9)], 0.62, 0.06, 0.03, True, 0.006)
    p = d.hit(0, 0.40, True)
    d.caja("st_plastico", p, (1.2, 0.06, 0.2))
    for sx in (-1, 1):
        d.caja("st_pintura_muscle", Vector((sx * 0.98, 0.42, 1.0)), (0.15, 0.1, 0.08))
    d.crear(coll)


def cuna(scn, coll, cortes):
    mats = comunes()
    mats["pintura"] = material("st_pintura_cuna", (0.02, 0.13, 0.42), 0.6, 0.2, coat=1.0)
    L = 4.5
    S = [
        (0.000, 0.80, 0.22, 0.38, 0.38), (0.012, 0.92, 0.17, 0.44, 0.44), (0.080, 0.98, 0.15, 0.52, 0.52),
        (0.200, 1.00, 0.15, 0.60, 0.62), (0.240, 1.00, 0.15, 0.62, 0.70), (0.420, 0.98, 0.15, 0.70, 1.10),
        (0.540, 0.98, 0.15, 0.74, 1.12), (0.600, 1.00, 0.15, 0.78, 1.04), (0.800, 1.02, 0.15, 0.86, 0.94),
        (0.940, 1.02, 0.16, 0.92, 0.95), (0.985, 0.99, 0.20, 0.92, 0.94), (1.000, 0.90, 0.26, 0.90, 0.90),
    ]
    forma = {"parabrisas": (0.24, 0.42), "techo": (0.42, 0.60), "luneta": (0.60, 0.62), "roof_w": 0.6,
             "techo_negro": True, "pliegue": 1.3, "canto_trasero": 0.9, "tuck": 0.95}
    body = carroceria(scn, coll, "carroceria", L, S, mats, forma)
    ruedas_y_pasos(scn, coll, cortes, body, mats, [("D", 1.40, 0.33, 0.27, 0.86), ("T", -1.38, 0.35, 0.33, 0.86)])
    d = Detalles(body)
    d.tira("st_luz_roja", [x / 20 for x in range(-18, 19)], 0.80, 0.03, 0.03, False, -0.006)  # tira LED fina
    for sx in (-1, 1):
        d.tira("st_luz_roja", [sx * (0.72 + i * 0.03) for i in range(7)], 0.74, 0.12, 0.03, False, -0.004)
    p = d.hit(0, 0.30, False)
    d.caja("st_plastico", p + Vector((0, -0.03, -0.02)), (1.6, 0.12, 0.2))  # difusor grande
    for fx in (-0.5, -0.3, 0.3, 0.5):
        d.caja("st_plastico", Vector((fx, p.y - 0.06, 0.24)), (0.03, 0.26, 0.16))
    d.cil_y("st_cromo", Vector((0, p.y - 0.06, 0.42)), 0.07, 0.16, 24)  # escape central
    d.cil_y("st_plastico", Vector((0, p.y - 0.145, 0.42)), 0.055, 0.02, 24)
    for z in (0.90, 0.88, 0.86, 0.84):  # lamas en la tapa del motor
        t = d.top(-1.1 - (0.90 - z) * 4)
        if t is not None:
            d.caja("st_plastico", t + Vector((0, 0, 0.005)), (1.1, 0.05, 0.02))
    for sx in (-1, 1):
        d.tira("st_luz_blanca", [sx * (0.45 + i * 0.05) for i in range(8)], 0.42, 0.035, 0.03, True, 0.006)
    d.crear(coll)


def palo(d, mat, a, b, r, segs=12):
    """Cilindro entre dos puntos (miembros del piloto, horquilla...)."""
    a, b = Vector(a), Vector(b)
    v = b - a
    rot = v.to_track_quat("Z", "Y").to_matrix().to_4x4()
    bmesh.ops.create_cone(d.bm(mat), cap_ends=True, segments=segs, radius1=r, radius2=r * 0.92, depth=v.length,
                          matrix=Matrix.Translation((a + b) / 2) @ rot)


def bola(d, mat, c, r, escala=(1, 1, 1)):
    bmesh.ops.create_uvsphere(d.bm(mat), u_segments=20, v_segments=12, radius=r,
                              matrix=Matrix.Translation(c) @ Matrix.Diagonal((*escala, 1)))


def moto(scn, coll, cortes):
    mats = comunes()
    mats["pintura"] = material("st_pintura_moto", (0.62, 0.44, 0.02), 0.45, 0.25, coat=1.0)
    material("st_traje", (0.02, 0.02, 0.025), 0.1, 0.55)
    material("st_casco", (0.62, 0.44, 0.02), 0.45, 0.2, coat=1.0)
    material("st_motor", (0.09, 0.09, 0.1), 0.8, 0.35)
    L = 1.9
    S = [
        (0.00, 0.10, 0.80, 0.95, 0.95), (0.05, 0.20, 0.62, 1.02, 1.02), (0.15, 0.27, 0.55, 1.08, 1.08),
        (0.28, 0.25, 0.50, 1.05, 1.05), (0.40, 0.24, 0.48, 1.02, 1.02), (0.50, 0.18, 0.55, 0.93, 0.93),
        (0.65, 0.15, 0.70, 0.92, 0.92), (0.80, 0.13, 0.78, 0.98, 0.98), (0.95, 0.09, 0.86, 1.02, 1.02),
        (1.00, 0.05, 0.92, 1.02, 1.02),
    ]
    forma = {"parabrisas": (-1, -1), "techo": (-1, -1), "luneta": (-1, -1)}
    body = carroceria(scn, coll, "carroceria", L, S, mats, forma)
    for pref, y, r, ancho in (("D", 0.70, 0.30, 0.12), ("T", -0.72, 0.31, 0.18)):
        rueda(coll, f"rueda_{pref}", mats, r, ancho, 1).location = (0, y, r)
    d = Detalles(body)
    # Mecánica: motor, basculante, horquilla, manillar y escape.
    d.caja("st_motor", Vector((0, 0.18, 0.44)), (0.30, 0.50, 0.30))
    palo(d, "st_motor", (0.09, -0.72, 0.31), (0.09, -0.05, 0.45), 0.035)
    palo(d, "st_motor", (-0.09, -0.72, 0.31), (-0.09, -0.05, 0.45), 0.035)
    for sx in (-1, 1):
        palo(d, "st_cromo", (sx * 0.08, 0.70, 0.31), (sx * 0.08, 0.52, 0.98), 0.03)
        palo(d, "st_motor", (sx * 0.06, 0.50, 1.00), (sx * 0.30, 0.46, 1.00), 0.018)
    palo(d, "st_cromo", (0.12, -0.15, 0.32), (0.16, -0.78, 0.62), 0.045)
    # Luces: piloto LED bajo el colín y faro.
    d.caja("st_luz_roja", Vector((0, -0.96, 0.95)), (0.16, 0.02, 0.035))
    d.caja("st_plastico", Vector((0, -0.98, 0.78)), (0.18, 0.02, 0.12))
    d.caja("st_luz_blanca", Vector((0, 0.95, 0.88)), (0.12, 0.02, 0.05))
    # Piloto agachado sobre el depósito.
    for sx in (-1, 1):
        palo(d, "st_traje", (sx * 0.13, -0.30, 1.02), (sx * 0.22, 0.05, 0.82), 0.075)   # muslo
        palo(d, "st_traje", (sx * 0.22, 0.05, 0.82), (sx * 0.19, -0.30, 0.50), 0.06)    # pierna
        bola(d, "st_traje", (sx * 0.19, -0.34, 0.48), 0.065, (0.9, 1.6, 0.8))           # bota
        palo(d, "st_traje", (sx * 0.17, 0.12, 1.20), (sx * 0.24, 0.32, 1.08), 0.055)   # brazo
        palo(d, "st_traje", (sx * 0.24, 0.32, 1.08), (sx * 0.29, 0.47, 1.01), 0.048)   # antebrazo
    palo(d, "st_traje", (0, -0.32, 1.04), (0, 0.14, 1.22), 0.17, 16)                 # torso
    bola(d, "st_traje", (0, -0.30, 1.03), 0.17, (1.15, 1, 0.8))                      # cadera
    bola(d, "st_casco", (0, 0.30, 1.30), 0.15, (0.95, 1.1, 0.95))                    # casco
    bola(d, "st_cristal", (0, 0.40, 1.29), 0.11, (0.9, 0.6, 0.55))                   # visera
    d.crear(coll)
    for o in coll.objects:
        if o.name.startswith("det_st_traje") or o.name.startswith("det_st_casco") or o.name.startswith("det_st_cristal"):
            for p in o.data.polygons:
                p.use_smooth = True


COCHES = {"muscle": muscle, "cuna": cuna, "moto": moto}


def construir(nombre):
    scn = bpy.data.scenes.get(nombre) or bpy.data.scenes.new(nombre)
    win = bpy.context.window
    win.scene = scn
    for o in list(scn.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for c in list(scn.collection.children):
        scn.collection.children.unlink(c)
    coll = bpy.data.collections.new(f"coche_{nombre}")
    cortes = bpy.data.collections.new(f"cortes_{nombre}")
    scn.collection.children.link(coll)
    scn.collection.children.link(cortes)
    COCHES[nombre](scn, coll, cortes)
    vl = scn.view_layers[0]
    win.view_layer = vl
    vl.active_layer_collection = vl.layer_collection.children[coll.name]
    path = os.path.join(REPO, "public", "models", f"{nombre}.glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=False, use_active_collection=True,
                              use_active_scene=True, export_apply=True, export_yup=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(REPO, "assets", "blender", "vehiculos.blend"), copy=True)
    print(f"{nombre}: {os.path.getsize(path) // 1024} KB -> {path}")
    return coll.name
