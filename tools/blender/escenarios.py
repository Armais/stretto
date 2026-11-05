"""Generador de las piezas de escenario de Stretto (P14), se ejecuta dentro de Blender:

    exec(open(r"<repo>/tools/blender/escenarios.py", encoding="utf-8").read())
    construir("comun")   # crea la escena, guarda el .blend y exporta public/models/escenario_comun.glb

Ejes de Blender: X a la derecha, Y hacia delante (lejos de la cámara) y Z arriba; el
exportador glTF convierte +Y en -Z, que es "hacia delante" en el juego. Cada pieza es un
objeto suelto con el origen en el suelo y el juego la busca por su nombre.

Materiales con nombre especial, que el juego cambia al cargar:
- es_ventanas: fachada con la textura de ventanas del juego. UV medidas en ventanas.
- luz_*: luces. El juego las pinta sin sombrear y con su intensidad de emisión, para el bloom.
- cartel_*: caras de carteles. El juego les pone el texto dibujado en un canvas. UV de 0 a 1.
- neon: tubos de neón. El juego les pone el color de acento del nivel.
"""

import math
import os
import random

import bmesh
import bpy
from mathutils import Matrix, Vector, noise

REPO = r"C:\Users\adiaz\NuevasIdeasJuegosApps\Juegos\JamGameOff2026Itchio"
VENTANA_W = 1.8  # una ventana de la textura del juego mide 1,8 x 3,3 m
VENTANA_H = 3.3


# ---------------------------------------------------------------- materiales

def material(name, color, metallic=0.0, rough=0.6, emit=None, strength=0.0, alpha=None):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    b = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    ins = b.inputs
    ins["Base Color"].default_value = (*color, 1)
    ins["Metallic"].default_value = metallic
    ins["Roughness"].default_value = rough
    if emit:
        ins["Emission Color"].default_value = (*emit, 1)
        ins["Emission Strength"].default_value = strength
    if alpha is not None:
        ins["Alpha"].default_value = alpha
        mat.blend_method = "BLEND"
    mat.diffuse_color = (*color, 1)
    return mat


def luz(name, color, k):
    """Luz: el juego la pinta con este color multiplicado por k."""
    return material(name, color, 0.0, 0.4, emit=color, strength=k)


def mats():
    return {
        "hormigon": material("es_hormigon", (0.28, 0.28, 0.27), 0.0, 0.9),
        "hormigon_osc": material("es_hormigon_osc", (0.11, 0.11, 0.11), 0.0, 0.95),
        "acero": material("es_acero", (0.32, 0.33, 0.35), 0.8, 0.45),
        "acero_osc": material("es_acero_osc", (0.06, 0.065, 0.07), 0.6, 0.5),
        "verde_cartel": material("es_verde_cartel", (0.01, 0.12, 0.05), 0.2, 0.5),
        "cristal": material("es_cristal", (0.35, 0.45, 0.5), 0.0, 0.08, alpha=0.18),
        "ventanas": material("es_ventanas", (0.1, 0.1, 0.1), 0.0, 0.4),
        "luz_farola": luz("luz_farola", (1.0, 0.72, 0.4), 3.0),
        "luz_cartel": luz("luz_cartel", (0.95, 0.95, 1.0), 2.0),
        "luz_captafaro": luz("luz_captafaro", (1.0, 0.63, 0.19), 2.2),
        "luz_aviso": luz("luz_aviso", (1.0, 0.08, 0.06), 2.5),
        "neon": luz("neon", (1.0, 0.5, 0.2), 2.4),
    }


# ---------------------------------------------------------------- construcción

class Pieza:
    """Una malla con varios materiales, construida a base de primitivas."""

    def __init__(self, nombre):
        self.nombre = nombre
        self.bm = bmesh.new()
        self.mats = []
        self.fila = random.randint(0, 31)

    def _marca(self, mat, caras, liso=False):
        """Pone material a las caras recién creadas. Se le pasan las caras (o los vértices de una
        primitiva suelta): las operaciones de bmesh crean y borran caras por dentro y las nuevas
        ocupan huecos de la lista, así que "las últimas N caras" no son siempre las nuevas."""
        if mat not in self.mats:
            self.mats.append(mat)
        i = self.mats.index(mat)
        for f in caras:
            f.material_index = i
            f.smooth = liso

    @staticmethod
    def _caras(verts):
        return {f for v in verts for f in v.link_faces}

    def caja(self, mat, centro, tam, rot=(0, 0, 0)):
        m = Matrix.Translation(centro) @ euler(rot) @ Matrix.Diagonal((*tam, 1))
        res = bmesh.ops.create_cube(self.bm, size=1.0, matrix=m)
        self._marca(mat, self._caras(res["verts"]))

    def cilindro(self, mat, a, b, r1, r2=None, segs=12, liso=True):
        """Cilindro (o tronco de cono) de `a` a `b`."""
        a, b = Vector(a), Vector(b)
        v = b - a
        if v.length < 1e-6:
            return
        rot = v.to_track_quat("Z", "Y").to_matrix().to_4x4()
        res = bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r1,
                              radius2=r1 if r2 is None else r2, depth=v.length,
                              matrix=Matrix.Translation((a + b) / 2) @ rot)
        self._marca(mat, self._caras(res["verts"]), liso)

    def tubo(self, mat, puntos, r, segs=8):
        """Tubo que pasa por varios puntos (brazos de farola, cables...)."""
        for a, b in zip(puntos, puntos[1:]):
            self.cilindro(mat, a, b, r, segs=segs)

    def esfera(self, mat, c, r, escala=(1, 1, 1), sub=2, liso=True):
        res = bmesh.ops.create_icosphere(self.bm, subdivisions=sub, radius=r,
                                         matrix=Matrix.Translation(c) @ Matrix.Diagonal((*escala, 1)))
        self._marca(mat, self._caras(res["verts"]), liso)

    def idx(self, mat):
        if mat not in self.mats:
            self.mats.append(mat)
        return self.mats.index(mat)

    def rejilla(self, filas, mat_de, cerrar=False):
        """Superficie a partir de filas de puntos (todas del mismo largo). `mat_de(cara)` elige
        el material de cada cara (por ejemplo, roca si es empinada y hierba si es llana)."""
        vs = [[self.bm.verts.new(p) for p in fila] for fila in filas]
        for a, b in zip(vs, vs[1:]):
            n = len(a) if cerrar else len(a) - 1
            for i in range(n):
                j = (i + 1) % len(a)
                f = self.bm.faces.new((a[i], a[j], b[j], b[i]))
                f.normal_update()
                f.material_index = self.idx(mat_de(f))
                f.smooth = False

    def perfil(self, mat, puntos, y0, y1, x=0.0, cortes=1, tapas=True):
        """Extruye un perfil cerrado del plano XZ (lista de (x, z)) a lo largo de Y, con
        `cortes` tramos (las piezas largas necesitan vértices para doblarse en las curvas)."""
        caras = []
        anillos = []
        for k in range(cortes + 1):
            y = y0 + (y1 - y0) * k / cortes
            anillos.append([self.bm.verts.new((x + px, y, pz)) for px, pz in puntos])
        m = len(puntos)
        for a, b in zip(anillos, anillos[1:]):
            for i in range(m):
                j = (i + 1) % m
                caras.append(self.bm.faces.new((a[i], a[j], b[j], b[i])))
        if tapas:
            caras.append(self.bm.faces.new(list(reversed(anillos[0]))))
            caras.append(self.bm.faces.new(anillos[-1]))
        self._marca(mat, caras)

    def malla(self, mat, me, matriz=Matrix(), liso=False):
        """Añade una malla de Blender (texto convertido, por ejemplo)."""
        antes = set(self.bm.faces)
        tmp = me.copy()
        tmp.transform(matriz)
        self.bm.from_mesh(tmp)
        bpy.data.meshes.remove(tmp)
        self._marca(mat, [f for f in self.bm.faces if f not in antes], liso)

    def crear(self, coll, pos=(0, 0, 0)):
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        uv = self.bm.loops.layers.uv.verify()
        azotea = None
        for f in self.bm.faces:
            nombre = self.mats[f.material_index].name
            nrm = f.normal
            if nombre == "es_ventanas" and abs(nrm.z) > 0.5:
                # Las tapas de un volumen con ventanas son azotea, no fachada.
                if azotea is None:
                    azotea = material("es_azotea", (0.035, 0.035, 0.04), 0.0, 0.9)
                    if azotea not in self.mats:
                        self.mats.append(azotea)
                f.material_index = self.mats.index(azotea)
                nombre = azotea.name
            if nombre == "es_ventanas":
                # En ventanas: la horizontal a lo largo de la cara y la vertical en altura.
                # Cada orientación se desplaza unas ventanas enteras y cada pieza unas filas,
                # para que dos caras o dos edificios no enciendan las mismas.
                lado = (0 if nrm.x > 0 else 5) if abs(nrm.x) > abs(nrm.y) else (9 if nrm.y > 0 else 13)
                for l in f.loops:
                    p = l.vert.co
                    h = p.y if abs(nrm.x) > abs(nrm.y) else p.x
                    l[uv].uv = (h / VENTANA_W + lado, p.z / VENTANA_H + self.fila)
            elif nombre.startswith("cartel_"):
                uv_cara(f, uv)
            else:
                for l in f.loops:
                    p = l.vert.co
                    l[uv].uv = (p.x + p.y, p.z)
        me = bpy.data.meshes.new(self.nombre)
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.mats:
            me.materials.append(m)
        ob = bpy.data.objects.new(self.nombre, me)
        ob.location = pos
        coll.objects.link(ob)
        return ob


def uv_cara(f, uv):
    """UV de 0 a 1 sobre una cara plana, con la U hacia la derecha de quien la mira."""
    n = f.normal
    up = Vector((0, 0, 1))
    der = up.cross(n).normalized() if abs(n.z) < 0.9 else Vector((1, 0, 0))
    arr = n.cross(der).normalized()
    arr = -arr if arr.z < 0 else arr
    ps = [(l.vert.co.dot(der), l.vert.co.dot(arr)) for l in f.loops]
    u0, u1 = min(p[0] for p in ps), max(p[0] for p in ps)
    v0, v1 = min(p[1] for p in ps), max(p[1] for p in ps)
    for l, (u, v) in zip(f.loops, ps):
        l[uv].uv = ((u - u0) / max(u1 - u0, 1e-6), (v - v0) / max(v1 - v0, 1e-6))


def euler(rot):
    from mathutils import Euler
    return Euler(rot).to_matrix().to_4x4()


def texto(cuerpo, alto, grosor_tubo=0.0, extrude=0.0):
    """Malla de un texto de pie (en el plano XZ, mirando a -Y), centrada en X y con la base
    en z = 0. Con `grosor_tubo`, solo el contorno de las letras como tubos (neón)."""
    cu = bpy.data.curves.new("txt", type="FONT")
    cu.body = cuerpo
    cu.size = alto
    cu.align_x = "CENTER"
    cu.extrude = extrude
    if grosor_tubo:
        cu.fill_mode = "NONE"
        cu.bevel_depth = grosor_tubo
        cu.bevel_resolution = 1
    ob = bpy.data.objects.new("txt", cu)
    bpy.context.scene.collection.objects.link(ob)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    bpy.data.objects.remove(ob, do_unlink=True)
    bpy.data.curves.remove(cu)
    me.transform(Matrix.Rotation(math.pi / 2, 4, "X"))
    zmin = min(v.co.z for v in me.vertices)
    me.transform(Matrix.Translation((0, 0, -zmin)))
    return me


def anclar(d, mat, x, y, ancho=0.5):
    """Placa de anclaje con cuatro pernos al pie de un poste."""
    d.caja(mat, (x, y, 0.025), (ancho, ancho, 0.05))
    for sx in (-1, 1):
        for sy in (-1, 1):
            d.cilindro(mat, (x + sx * ancho * 0.35, y + sy * ancho * 0.35, 0.05),
                       (x + sx * ancho * 0.35, y + sy * ancho * 0.35, 0.11), 0.025, segs=6)


def celosia(d, mat, a, b, ancho, alto, paso, r=0.05):
    """Viga de celosía de cuatro cordones de `a` a `b` (horizontal o vertical)."""
    a, b = Vector(a), Vector(b)
    eje = (b - a).normalized()
    lado = Vector((0, 0, 1)).cross(eje)
    if lado.length < 1e-3:
        lado = Vector((1, 0, 0))
    lado.normalize()
    arriba = eje.cross(lado).normalized()
    esquinas = [lado * sx * ancho / 2 + arriba * sz * alto / 2 for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    for e in esquinas:
        d.cilindro(mat, a + e, b + e, r, segs=6)
    n = max(1, int((b - a).length / paso))
    for k in range(n):
        p0 = a + (b - a) * (k / n)
        p1 = a + (b - a) * ((k + 1) / n)
        for i in range(4):
            e0, e1 = esquinas[i], esquinas[(i + 1) % 4]
            if k % 2 == 0:
                d.cilindro(mat, p0 + e0, p1 + e1, r * 0.6, segs=4)
            else:
                d.cilindro(mat, p0 + e1, p1 + e0, r * 0.6, segs=4)
            d.cilindro(mat, p0 + e0, p0 + e1, r * 0.6, segs=4)


def ruido(x, y, z=0.0, periodo=None, octavas=3):
    """Ruido de Perlin con varias octavas. Con `periodo`, se repite a lo largo de Y cada
    `periodo` metros: dos piezas iguales seguidas empalman sin costura."""
    total, amp, f = 0.0, 1.0, 1.0
    for _ in range(octavas):
        if periodo:
            a = 2 * math.pi * y / periodo
            r = periodo / (2 * math.pi) * f
            v = Vector((x * f, math.cos(a) * r, math.sin(a) * r + z * f))
        else:
            v = Vector((x * f, y * f, z * f))
        total += noise.noise(v) * amp
        amp *= 0.5
        f *= 2.0
    return total


def roca(d, mat, c, r, escala, semilla, sub=2, aspereza=0.35):
    """Roca: icosfera deformada con ruido y caras planas."""
    res = bmesh.ops.create_icosphere(d.bm, subdivisions=sub, radius=1.0)
    off = Vector((semilla * 13.1, semilla * 7.7, semilla * 3.3))
    for v in res["verts"]:
        k = 1.0 + aspereza * ruido(*(v.co * 1.3 + off))
        v.co = Vector((v.co.x * escala[0], v.co.y * escala[1], v.co.z * escala[2])) * r * k + Vector(c)
    d._marca(mat, d._caras(res["verts"]))


def catenaria(a, b, flecha, n=12):
    """Puntos de un cable colgado entre `a` y `b`."""
    a, b = Vector(a), Vector(b)
    return [a.lerp(b, t) - Vector((0, 0, flecha * 4 * t * (1 - t))) for t in (k / n for k in range(n + 1))]


# ---------------------------------------------------------------- piezas comunes

def farola(coll, m):
    """Farola de autopista: fuste troncocónico octogonal, brazo curvo hacia -X y luminaria LED.
    La luminaria queda 2,9 m hacia dentro del fuste y a 8,9 m de altura."""
    d = Pieza("farola")
    anclar(d, m["acero_osc"], 0, 0)
    d.cilindro(m["acero"], (0, 0, 0.05), (0, 0, 9.0), 0.13, 0.075, segs=8, liso=False)
    d.cilindro(m["acero"], (0, 0, 0.05), (0, 0, 1.1), 0.15, 0.15, segs=8, liso=False)
    d.caja(m["acero_osc"], (0.15, 0, 0.7), (0.02, 0.12, 0.3))  # portezuela de registro
    arco = [(0, 0, 8.7)] + [(-(1.0 - math.cos(t)) * 1.0, 0, 8.7 + math.sin(t) * 0.75) for t in
                            [math.pi / 2 * k / 6 for k in range(1, 7)]]
    arco += [(-2.6, 0, 9.47), (-2.95, 0, 9.45)]
    d.tubo(m["acero"], arco, 0.055)
    d.caja(m["acero_osc"], (-3.05, 0, 9.4), (0.95, 0.4, 0.12), rot=(0, math.radians(-4), 0))
    d.caja(m["acero_osc"], (-2.55, 0, 9.43), (0.2, 0.22, 0.14))
    d.caja(m["luz_farola"], (-3.1, 0, 9.33), (0.72, 0.3, 0.02), rot=(0, math.radians(-4), 0))
    return d.crear(coll)


def quitamiedos(coll, m):
    """Tramo de 6 m de barrera de hormigón New Jersey con junta, sumidero y captafaro."""
    d = Pieza("quitamiedos")
    largo = 5.94
    perfil = [(-0.3, 0), (0.3, 0), (0.3, 0.08), (0.12, 0.3), (0.1, 0.85), (-0.1, 0.85), (-0.12, 0.3), (-0.3, 0.08)]
    d.perfil(m["hormigon"], perfil, -largo / 2 + 0.03, largo / 2 - 0.03)
    # Biseles de la junta en los dos extremos (un poco más oscuros).
    for s in (-1, 1):
        d.perfil(m["hormigon_osc"], [(x * 0.96, z) for x, z in perfil], s * (largo / 2 - 0.03), s * largo / 2)
    d.caja(m["hormigon_osc"], (0, 0, 0.06), (0.62, 0.7, 0.12))  # sumidero
    d.caja(m["acero_osc"], (0, 0, 0.87), (0.08, 0.16, 0.05))
    d.caja(m["luz_captafaro"], (0, -0.081, 0.875), (0.07, 0.004, 0.035))
    return d.crear(coll)


def portico(coll, m):
    """Pórtico de señales sobre la calzada: dos pies de celosía a ±11 m, viga de celosía y dos
    paneles verdes (cartel_salida_1 a la izquierda y cartel_salida_2 a la derecha) con sus
    focos. Los paneles miran a -Y (a quien llega)."""
    d = Pieza("portico")
    for sx in (-1, 1):
        x = sx * 11.0
        anclar(d, m["hormigon"], x, 0, 1.2)
        celosia(d, m["acero"], (x, 0, 0.1), (x, 0, 9.0), 0.7, 0.7, 0.9, r=0.06)
    celosia(d, m["acero"], (-11.35, 0, 8.4), (11.35, 0, 8.4), 1.0, 1.0, 1.1, r=0.06)
    for i, cx in enumerate((-2.9, 2.9)):
        d.caja(m["verde_cartel"], (cx, -0.65, 7.0), (4.7, 0.12, 2.7))
        d.caja(m["acero"], (cx, -0.58, 7.0), (4.8, 0.03, 2.8))  # marco
        d.caja(bpy.data.materials["cartel_salida_%d" % (i + 1)], (cx, -0.715, 7.0), (4.6, 0.01, 2.6))
        for fx in (-1.4, 0, 1.4):
            d.caja(m["acero_osc"], (cx + fx, -1.15, 8.55), (0.35, 0.25, 0.12))
            d.cilindro(m["acero_osc"], (cx + fx, -0.5, 8.4), (cx + fx, -1.1, 8.55), 0.03, segs=6)
            d.caja(m["luz_cartel"], (cx + fx, -1.15, 8.485), (0.3, 0.2, 0.01))
    return d.crear(coll)


def neon_radio(coll, m):
    """Valla de Night Shift FM: panel oscuro sobre un fuste, con las letras en tubos de neón
    y una luna creciente. Mira a -Y. Se coloca fuera de la calzada."""
    d = Pieza("neon_radio")
    d.cilindro(m["acero_osc"], (0, 0.4, 0), (0, 0.4, 11.0), 0.45, 0.4, segs=12)
    anclar(d, m["hormigon"], 0, 0.4, 1.6)
    d.caja(m["acero_osc"], (0, 0.15, 13.0), (12.6, 0.35, 4.6))
    d.caja(m["acero"], (0, 0.15, 10.65), (12.0, 0.9, 0.1))  # pasarela de mantenimiento
    for x in (-5, -2.5, 0, 2.5, 5):
        d.cilindro(m["acero"], (x, -0.3, 10.7), (x, -0.3, 11.5), 0.02, segs=4)
    d.cilindro(m["acero"], (-5.5, -0.3, 11.5), (5.5, -0.3, 11.5), 0.02, segs=4)
    d.malla(m["neon"], texto("NIGHT SHIFT", 1.55, 0.045), Matrix.Translation((1.45, -0.05, 13.35)))
    d.malla(m["neon"], texto("FM 98.4", 1.0, 0.04), Matrix.Translation((1.45, -0.05, 11.75)))
    # Luna creciente: dos arcos de tubo.
    c = Vector((-4.75, -0.05, 13.0))
    exterior = [c + Vector((math.cos(t) * 1.25, 0, math.sin(t) * 1.25)) for t in
                [math.radians(a) for a in range(60, 301, 15)]]
    interior = [c + Vector((0.48 + math.cos(t) * 0.9, 0, math.sin(t) * 0.9)) for t in
                [math.radians(a) for a in range(75, 286, 15)]]
    d.tubo(m["neon"], exterior, 0.05, segs=6)
    d.tubo(m["neon"], interior, 0.05, segs=6)
    d.tubo(m["neon"], [exterior[0], interior[0]], 0.05, segs=6)
    d.tubo(m["neon"], [exterior[-1], interior[-1]], 0.05, segs=6)
    return d.crear(coll)


def paso_elevado(coll, m):
    """Paso elevado que cruza por encima: tablero cajón de 12 m de ancho a 6,8 m de gálibo,
    pilas a ±14 y ±38 m, pretiles y farolas pequeñas encima."""
    d = Pieza("paso_elevado")
    L = 64.0
    # Tablero (perfil en YZ extruido a lo largo de X): se construye girando un perfil XZ.
    tablero = [(-5.0, 6.8), (5.0, 6.8), (6.2, 7.6), (6.2, 8.3), (-6.2, 8.3), (-6.2, 7.6)]
    t = Pieza("_t")
    t.perfil(m["hormigon"], tablero, -L, L, cortes=16)
    me = bpy.data.meshes.new("_t")
    t.bm.to_mesh(me)
    t.bm.free()
    d.malla(m["hormigon"], me, Matrix.Rotation(-math.pi / 2, 4, "Z"))
    bpy.data.meshes.remove(me)
    # Pretiles New Jersey a los dos lados del tablero y barandilla encima.
    pret = [(-0.25, 0), (0.25, 0), (0.1, 0.25), (0.08, 0.8), (-0.08, 0.8), (-0.1, 0.25)]
    for sy in (-1, 1):
        p = Pieza("_p")
        p.perfil(m["hormigon"], pret, -L, L, x=0, cortes=16)
        me = bpy.data.meshes.new("_p")
        p.bm.to_mesh(me)
        p.bm.free()
        d.malla(m["hormigon"], me, Matrix.Translation((0, sy * 5.9, 8.3)) @ Matrix.Rotation(-math.pi / 2, 4, "Z"))
        bpy.data.meshes.remove(me)
        d.cilindro(m["acero"], (-L, sy * 5.9, 9.35), (L, sy * 5.9, 9.35), 0.04, segs=6)
        for x in range(-int(L), int(L) + 1, 2):
            d.cilindro(m["acero"], (x, sy * 5.9, 9.1), (x, sy * 5.9, 9.35), 0.025, segs=4)
    # Pilas con capitel.
    for x in (-38, -14, 14, 38):
        d.caja(m["hormigon"], (x, 0, 3.0), (1.4, 2.6, 6.0))
        d.caja(m["hormigon"], (x, 0, 6.4), (1.8, 7.0, 0.8))
    # Farolas pequeñas sobre el tablero, mirando a la calzada de arriba.
    for x in (-30, -6, 18, 42):
        d.cilindro(m["acero"], (x, -5.6, 9.1), (x, -5.6, 13.0), 0.07, 0.05, segs=8)
        d.caja(m["acero_osc"], (x, -4.9, 13.0), (0.3, 1.5, 0.1))
        d.caja(m["luz_farola"], (x, -4.4, 12.94), (0.24, 0.5, 0.02))
    # Faldón de luz cálida bajo el tablero (las farolas de abajo lo iluminan).
    return d.crear(coll)


def pantalla(coll, m):
    """Tramo de 4 m de pantalla acústica: zócalo de hormigón, paneles de metacrilato con
    travesaños y postes en H. Se coloca detrás del quitamiedos."""
    d = Pieza("pantalla")
    d.caja(m["hormigon"], (0, 0, 0.5), (0.2, 4.0, 1.0))
    for y in (-2.0, 2.0):
        d.caja(m["acero"], (0, y, 2.5), (0.18, 0.18, 5.0))
        d.caja(m["acero_osc"], (0, y, 5.02), (0.22, 0.22, 0.04))
    for z in (1.0, 2.35, 3.7, 5.0):
        d.caja(m["acero"], (0, 0, z), (0.1, 3.82, 0.08))
    d.caja(m["cristal"], (0, 0, 3.0), (0.03, 3.82, 4.0))
    return d.crear(coll)


# ---------------------------------------------------------------- ciudad

def mats_ciudad():
    m = mats()
    m.update({
        "fach_hormigon": material("es_fach_hormigon", (0.15, 0.15, 0.15), 0.0, 0.85),
        "fach_ladrillo": material("es_fach_ladrillo", (0.13, 0.055, 0.04), 0.0, 0.9),
        "fach_panel": material("es_fach_panel", (0.045, 0.05, 0.055), 0.5, 0.4),
        "fach_piedra": material("es_fach_piedra", (0.2, 0.18, 0.15), 0.0, 0.85),
        "toldo": material("es_toldo", (0.12, 0.02, 0.02), 0.0, 0.8),
        "luz_escaparate": luz("luz_escaparate", (1.0, 0.6, 0.28), 0.5),
        "luz_rotulo": luz("luz_rotulo", (0.75, 0.88, 1.0), 1.1),
    })
    return m


def edificio(coll, m, nombre, w, d, h, rng, torre):
    """Edificio de w x d x h m: planta baja (escaparates o vestíbulo), cuerpo con ventanas,
    pilastras, cornisas cada cuatro plantas, retranqueos en las torres y azotea con maquinaria."""
    e = Pieza(nombre)
    fach = rng.choice([m["fach_hormigon"], m["fach_ladrillo"], m["fach_panel"], m["fach_piedra"]])
    pb = 6.6 if torre else 3.3 * 1.4
    e.caja(fach, (0, 0, pb / 2), (w, d, pb))
    # Escaparates (o vestíbulo de cristal) en las cuatro caras de la planta baja.
    for eje, largo, ancho in (("x", d, w), ("y", w, d)):
        for s in (-1, 1):
            n = max(1, int(largo / 4.5))
            paso = largo / n
            for k in range(n):
                c = -largo / 2 + paso * (k + 0.5)
                # Encendidos menos de la mitad y con montantes: si no, la planta baja de toda la
                # calle se ve como una franja continua de luz.
                lit = rng.random() < 0.45
                mat = m["luz_escaparate"] if lit else m["cristal"]
                alto = pb * rng.choice((0.62, 0.62, 0.5))
                zc = pb * 0.14 + alto / 2
                hojas = rng.choice((2, 3))
                if eje == "x":
                    e.caja(mat, (s * (ancho / 2 + 0.02), c, zc), (0.03, paso - 0.7, alto))
                else:
                    e.caja(mat, (c, s * (ancho / 2 + 0.02), zc), (paso - 0.7, 0.03, alto))
                for j in range(1, hojas):
                    cm = c - (paso - 0.7) / 2 + (paso - 0.7) * j / hojas
                    if eje == "x":
                        e.caja(m["acero_osc"], (s * (ancho / 2 + 0.05), cm, zc), (0.04, 0.14, alto))
                    else:
                        e.caja(m["acero_osc"], (cm, s * (ancho / 2 + 0.05), zc), (0.14, 0.04, alto))
            if not torre and rng.random() < 0.5:
                if eje == "x":
                    e.caja(m["toldo"], (s * (ancho / 2 + 0.6), 0, pb * 0.82), (1.2, largo * 0.8, 0.12), rot=(0, s * 0.25, 0))
                else:
                    e.caja(m["toldo"], (0, s * (ancho / 2 + 0.6), pb * 0.82), (largo * 0.8, 1.2, 0.12), rot=(-s * 0.25, 0, 0))
    # Cuerpos: uno en los bajos y dos o tres (con retranqueo) en las torres.
    cuerpos = []
    z0 = pb
    if torre:
        h1 = z0 + (h - z0) * rng.uniform(0.55, 0.75)
        cuerpos.append((w, d, z0, h1))
        w2, d2 = w * rng.uniform(0.62, 0.8), d * rng.uniform(0.62, 0.8)
        h2 = h if rng.random() < 0.5 else h1 + (h - h1) * 0.7
        cuerpos.append((w2, d2, h1, h2))
        if h2 < h:
            cuerpos.append((w2 * 0.6, d2 * 0.6, h2, h))
    else:
        cuerpos.append((w - 0.4, d - 0.4, z0, h))
    for i, (cw, cd, a, b) in enumerate(cuerpos):
        e.caja(m["ventanas"], (0, 0, (a + b) / 2), (cw, cd, b - a))
        # Pilastras: esquinas y una cada ~7 m, sobresaliendo 0,25 m.
        for s in (-1, 1):
            for t in (-1, 1):
                e.caja(fach, (s * cw / 2, t * cd / 2, (a + b) / 2), (0.7, 0.7, b - a))
            for k in range(1, int(cd / 7)):
                y = -cd / 2 + k * cd / int(cd / 7)
                e.caja(fach, (s * (cw / 2 + 0.12), y, (a + b) / 2), (0.25, 0.45, b - a))
            for k in range(1, int(cw / 7)):
                x = -cw / 2 + k * cw / int(cw / 7)
                e.caja(fach, (x, s * (cd / 2 + 0.12), (a + b) / 2), (0.45, 0.25, b - a))
        # Cornisas entre ventanas (las filas de la textura caen en múltiplos de 3,3 m).
        zc = math.ceil(a / VENTANA_H / 4) * VENTANA_H * 4
        while zc < b - 2:
            e.caja(fach, (0, 0, zc), (cw + 0.5, cd + 0.5, 0.4))
            zc += VENTANA_H * 4
        # Remate del cuerpo: cornisa más gruesa (pretil de la azotea).
        e.caja(fach, (0, 0, b + 0.5), (cw + 0.3, cd + 0.3, 1.0))
        e.caja(m["hormigon_osc"], (0, 0, b + 0.9), (cw - 0.4, cd - 0.4, 0.25))
    # Azotea: casetón, maquinaria de clima y, a veces, depósito de agua.
    tw, td, _, top = cuerpos[-1][0], cuerpos[-1][1], 0, cuerpos[-1][3]
    e.caja(fach, (tw * 0.18, -td * 0.15, top + 2.0), (min(4.0, tw * 0.35), min(5.0, td * 0.35), 3.0))
    for _ in range(rng.randint(2, 5)):
        x, y = rng.uniform(-tw * 0.35, tw * 0.35), rng.uniform(-td * 0.35, td * 0.35)
        e.caja(m["acero"], (x, y, top + 1.6), (rng.uniform(1.2, 2.4), rng.uniform(1.2, 2.4), 1.2))
    if rng.random() < 0.45:
        x, y = -tw * 0.22, td * 0.2
        for sx in (-1, 1):
            for sy in (-1, 1):
                e.cilindro(m["acero_osc"], (x + sx, y + sy, top + 1), (x + sx, y + sy, top + 3.5), 0.08, segs=4)
        e.cilindro(m["fach_ladrillo"], (x, y, top + 3.5), (x, y, top + 6.5), 1.6, segs=12, liso=False)
        e.cilindro(m["hormigon_osc"], (x, y, top + 6.5), (x, y, top + 7.3), 1.7, 0.2, segs=12, liso=False)
    if torre and h > 70:
        e.cilindro(m["acero"], (0, 0, top + 1), (0, 0, top + 14), 0.25, 0.08, segs=6)
        e.esfera(m["luz_aviso"], (0, 0, top + 14.2), 0.35, sub=1)
    elif torre:
        for sx in (-1, 1):
            e.esfera(m["luz_aviso"], (sx * (tw / 2 - 0.4), td / 2 - 0.4, top + 1.3), 0.25, sub=1)
    # Rótulo luminoso en la fachada de algunos bajos.
    if not torre and rng.random() < 0.4:
        s = rng.choice((-1, 1))
        e.caja(m["luz_rotulo"], (s * (w / 2 + 0.3), 0, pb + 0.9), (0.1, min(8.0, d * 0.5), 0.9))
    return e.crear(coll)


def grua(coll, m):
    """Grúa torre de obra: mástil de celosía de 52 m, pluma de 48 m, contrapluma con
    contrapeso, cabina, tirantes y luces rojas de aviso en la punta y en lo alto."""
    d = Pieza("grua")
    amar = material("es_amarillo_grua", (0.55, 0.38, 0.02), 0.2, 0.55)
    d.caja(m["hormigon"], (0, 0, 0.5), (5, 5, 1.0))
    H = 52.0
    celosia(d, amar, (0, 0, 1.0), (0, 0, H), 1.8, 1.8, 1.8, r=0.07)
    d.caja(amar, (0, 0, H + 0.6), (2.4, 2.4, 1.2))  # corona giratoria
    d.caja(m["fach_panel"], (1.6, -1.3, H - 1.0), (1.6, 1.8, 2.2))  # cabina
    d.caja(m["luz_escaparate"], (1.6, -2.22, H - 0.8), (1.4, 0.02, 1.0))
    celosia(d, amar, (0, 0, H + 1.9), (0, 0, H + 9.0), 1.6, 1.6, 1.8, r=0.06)  # torreta
    celosia(d, amar, (1.2, 0, H + 1.9), (48, 0, H + 1.9), 1.2, 1.4, 2.4, r=0.06)  # pluma
    celosia(d, amar, (-1.2, 0, H + 1.9), (-15, 0, H + 1.9), 1.6, 1.2, 2.4, r=0.06)  # contrapluma
    for x in (-11, -12.8):
        d.caja(m["hormigon"], (x, 0, H + 0.4), (1.6, 2.0, 2.0))
    for p in ((30, 0, H + 2.6), (-14, 0, H + 2.5)):
        d.cilindro(m["acero"], (0, 0, H + 9.0), p, 0.04, segs=4)
    d.cilindro(m["acero"], (22, 0, H + 1.2), (22, 0, H - 18), 0.03, segs=4)  # cable del gancho
    d.caja(m["acero_osc"], (22, 0, H - 18.4), (0.5, 0.5, 0.8))
    d.esfera(m["luz_aviso"], (48.2, 0, H + 2.7), 0.3, sub=1)
    d.esfera(m["luz_aviso"], (0, 0, H + 9.4), 0.3, sub=1)
    return d.crear(coll)


def torre_electrica(coll, m, vano):
    """Torre de alta tensión de celosía (34 m) con tres crucetas, aisladores y los cables que
    llegan a la siguiente torre, `vano` metros por delante (+Y)."""
    d = Pieza("torre_electrica")
    H = 34.0
    base, cima = 3.2, 0.9
    pies = [(sx, sy) for sx in (-1, 1) for sy in (-1, 1)]
    def pt(sx, sy, z):
        a = base + (cima - base) * min(z, 26) / 26
        return Vector((sx * a, sy * a, z))
    for sx, sy in pies:
        d.cilindro(m["acero"], pt(sx, sy, 0), pt(sx, sy, 26), 0.09, segs=4)
        d.cilindro(m["acero"], pt(sx, sy, 26), Vector((sx * 0.5, sy * 0.5, H)), 0.07, segs=4)
        d.caja(m["hormigon"], (sx * base, sy * base, 0.3), (0.9, 0.9, 0.6))
    niveles = [0, 4.5, 9, 13.5, 18, 22, 26]
    for z0, z1 in zip(niveles, niveles[1:]):
        for (ax, ay), (bx, by) in (((-1, -1), (1, -1)), ((1, -1), (1, 1)), ((1, 1), (-1, 1)), ((-1, 1), (-1, -1))):
            d.cilindro(m["acero"], pt(ax, ay, z0), pt(bx, by, z1), 0.04, segs=4)
            d.cilindro(m["acero"], pt(bx, by, z0), pt(ax, ay, z1), 0.04, segs=4)
            d.cilindro(m["acero"], pt(ax, ay, z1), pt(bx, by, z1), 0.045, segs=4)
    puntas = []
    for z, largo in ((19.0, 7.5), (24.0, 9.0), (29.0, 6.5)):
        for s in (-1, 1):
            d.cilindro(m["acero"], pt(s, -1, z), Vector((s * largo, 0, z)), 0.06, segs=4)
            d.cilindro(m["acero"], pt(s, 1, z), Vector((s * largo, 0, z)), 0.06, segs=4)
            d.cilindro(m["acero"], pt(s, 1, z + 2.5), Vector((s * largo, 0, z)), 0.04, segs=4)
            ais = Vector((s * (largo - 0.3), 0, z))
            for k in range(6):
                d.cilindro(m["cristal"], ais - Vector((0, 0, 0.35 * k + 0.1)), ais - Vector((0, 0, 0.35 * k + 0.3)), 0.18, segs=8)
            puntas.append(ais - Vector((0, 0, 2.2)))
    puntas.append(Vector((0, 0, H + 0.2)))
    for p in puntas:
        d.tubo(m["acero_osc"], catenaria(p, p + Vector((0, vano, 0)), 4.5, n=14), 0.045, segs=4)
    return d.crear(coll)


def grupo_ciudad(coll):
    m = mats_ciudad()
    rng = random.Random(7)
    # Bajos: fila cercana a la autopista (como los de 10-32 m del escenario provisional).
    for i, (w, d, h) in enumerate([(12, 18, 14), (16, 24, 22), (11, 15, 30), (18, 28, 18), (14, 20, 26), (10, 16, 11)]):
        edificio(coll, m, f"bajo_{i + 1}", w, d, h, rng, False)
    # Torres: segunda fila y horizonte.
    for i, (w, d, h) in enumerate([(20, 22, 48), (26, 20, 64), (18, 18, 86), (28, 26, 110), (22, 24, 74), (16, 16, 120)]):
        edificio(coll, m, f"torre_{i + 1}", w, d, h, rng, True)
    grua(coll, m)
    torre_electrica(coll, m, 110.0)


# ---------------------------------------------------------------- costa

def palmera(coll, m, nombre, alto, inclina, semilla):
    """Palmera: tronco curvo con anillos, corona de hojas caídas con nervio y cocos."""
    rng = random.Random(semilla)
    d = Pieza(nombre)
    n = 14
    pts = []
    for k in range(n + 1):
        t = k / n
        pts.append(Vector((inclina * t * t * alto, 0.15 * math.sin(t * 3) * alto * 0.1, t * alto)))
    for k, (a, b) in enumerate(zip(pts, pts[1:])):
        r = 0.3 - 0.12 * k / n
        d.cilindro(m["tronco"], a, b, r, r * 0.86, segs=9)
        d.cilindro(m["tronco_osc"], b - (b - a) * 0.12, b, r * 1.04, r * 0.95, segs=9)
    top = pts[-1]
    for k in range(3):
        a = k * 2.1
        d.esfera(m["coco"], top + Vector((math.cos(a) * 0.3, math.sin(a) * 0.3, -0.35)), 0.17, sub=1)
    hojas = rng.randint(10, 13)
    for k in range(hojas):
        a = 2 * math.pi * k / hojas + rng.uniform(-0.15, 0.15)
        largo = rng.uniform(3.6, 4.8)
        caida = rng.uniform(0.6, 1.3)
        dirv = Vector((math.cos(a), math.sin(a), 0))
        lado = Vector((-math.sin(a), math.cos(a), 0))
        filas = []
        segs = 8
        for i in range(segs + 1):
            t = i / segs
            centro = top + dirv * largo * t + Vector((0, 0, 0.9 * math.sin(t * math.pi * 0.6) - caida * t * t * largo * 0.55))
            ancho = 0.55 * math.sin(math.pi * min(1.0, t * 1.15)) + 0.02
            caer = Vector((0, 0, -0.25 * ancho))  # la hoja se pliega en V hacia abajo
            filas.append([centro - lado * ancho + caer, centro + Vector((0, 0, 0.03)), centro + lado * ancho + caer])
        d.rejilla(filas, lambda f: m["hoja"])
        # Cara de abajo (las hojas se ven desde abajo al pasar).
        d.rejilla([list(reversed(f)) for f in filas], lambda f: m["hoja_osc"])
    return d.crear(coll)


def faro(coll, m):
    """Faro sobre un cabo de roca: torre de 24 m a franjas, galería con barandilla, linterna
    encendida y cúpula, y la casa del farero al pie. El haz lo dibuja el juego."""
    d = Pieza("faro")
    roca(d, m["roca"], (0, 0, -8), 30, (1.4, 1.1, 0.55), 3, sub=3, aspereza=0.25)
    base = 8.0
    d.caja(m["blanco"], (9, 4, base + 2.2), (8, 6, 4.4))
    d.caja(m["tejado"], (9, 4, base + 4.9), (8.6, 6.6, 1.0))
    d.caja(m["luz_escaparate"], (9, 0.98, base + 2.3), (1.2, 0.05, 1.3))
    H = 24.0
    franjas = 6
    for k in range(franjas):
        z0 = base + H * k / franjas
        z1 = base + H * (k + 1) / franjas
        r0 = 3.2 - 1.2 * k / franjas
        r1 = 3.2 - 1.2 * (k + 1) / franjas
        d.cilindro(m["blanco"] if k % 2 == 0 else m["rojo_faro"], (0, 0, z0), (0, 0, z1), r0, r1, segs=16)
    top = base + H
    d.cilindro(m["acero_osc"], (0, 0, top), (0, 0, top + 0.3), 2.7, segs=16)
    for k in range(16):
        a = 2 * math.pi * k / 16
        d.cilindro(m["blanco"], (math.cos(a) * 2.5, math.sin(a) * 2.5, top + 0.3), (math.cos(a) * 2.5, math.sin(a) * 2.5, top + 1.3), 0.04, segs=4)
    d.cilindro(m["blanco"], (0, 0, top + 1.25), (0, 0, top + 1.35), 2.55, segs=16)
    d.cilindro(m["luz_faro"], (0, 0, top + 0.3), (0, 0, top + 2.8), 1.5, segs=12)
    for k in range(8):
        a = 2 * math.pi * k / 8
        d.cilindro(m["acero_osc"], (math.cos(a) * 1.55, math.sin(a) * 1.55, top + 0.3), (math.cos(a) * 1.55, math.sin(a) * 1.55, top + 2.8), 0.05, segs=4)
    d.cilindro(m["rojo_faro"], (0, 0, top + 2.8), (0, 0, top + 4.2), 1.75, 0.2, segs=16)
    return d.crear(coll)


def barca(coll, m):
    """Barca de pesca fondeada: casco con proa en punta, cabina con ventana encendida, mástil
    con su luz y la línea de flotación."""
    d = Pieza("barca")
    L, B, H = 8.0, 2.6, 1.3
    secc = []
    for k in range(9):
        t = k / 8
        y = -L / 2 + L * t
        w = B / 2 * (1 - max(0, (t - 0.6) / 0.4) ** 1.6)
        sube = 0.35 * max(0, (t - 0.6) / 0.4) ** 2
        secc.append([(-w, y, H + sube), (-w * 0.8, y, 0.3), (0, y, -0.25 + sube * 0.5), (w * 0.8, y, 0.3), (w, y, H + sube)])
    d.rejilla(secc, lambda f: m["casco"])
    d.rejilla([[(-p[0] * 0.98, p[1], H - 0.05 + (p[2] - H if p[2] > H else 0)) for p in (s[0], s[4])] for s in secc], lambda f: m["cubierta"])
    d.caja(m["blanco"], (0, -1.0, H + 0.9), (1.6, 2.2, 1.8))
    d.caja(m["luz_escaparate"], (0, -2.12, H + 1.2), (1.1, 0.04, 0.6))
    d.caja(m["tejado"], (0, -1.0, H + 1.85), (1.8, 2.4, 0.12))
    d.cilindro(m["blanco"], (0, 0.6, H), (0, 0.6, H + 5.0), 0.06, segs=6)
    d.esfera(m["luz_barca"], (0, 0.6, H + 5.1), 0.16, sub=1)
    d.caja(m["casco_franja"], (0, 0, 0.32), (B * 0.82, L * 0.55, 0.12))
    return d.crear(coll)


def barandilla(coll, m):
    """Tramo de 6 m de paseo marítimo: bordillo, barandilla blanca de tubo y una farola baja
    de paseo con su globo encendido."""
    d = Pieza("barandilla")
    d.caja(m["hormigon"], (0, 0, 0.2), (0.5, 6.0, 0.4))
    for y in (-3.0, -1.5, 0.0, 1.5):
        d.cilindro(m["blanco"], (0, y, 0.4), (0, y, 1.45), 0.04, segs=6)
    for z in (0.75, 1.1, 1.45):
        d.cilindro(m["blanco"], (0, -3.0, z), (0, 3.0, z), 0.03 if z < 1.4 else 0.045, segs=6)
    # Poste pintado y mate: uno metálico refleja el entorno y brilla como un tubo.
    d.cilindro(m["poste_paseo"], (0, 0, 0.4), (0, 0, 3.8), 0.06, segs=8)
    d.esfera(m["luz_paseo"], (0, 0, 4.05), 0.22, sub=2)
    return d.crear(coll)


def grupo_costa(coll):
    m = mats()
    m.update({
        "roca": material("es_roca_costa", (0.09, 0.08, 0.07), 0.0, 0.95),
        "tronco": material("es_tronco", (0.12, 0.09, 0.06), 0.0, 0.9),
        "tronco_osc": material("es_tronco_osc", (0.06, 0.045, 0.03), 0.0, 0.95),
        "hoja": material("es_hoja", (0.035, 0.07, 0.025), 0.0, 0.7),
        "hoja_osc": material("es_hoja_osc", (0.02, 0.04, 0.015), 0.0, 0.8),
        "coco": material("es_coco", (0.08, 0.05, 0.02), 0.0, 0.8),
        "blanco": material("es_blanco", (0.62, 0.62, 0.6), 0.0, 0.6),
        "rojo_faro": material("es_rojo_faro", (0.45, 0.03, 0.03), 0.0, 0.6),
        "tejado": material("es_tejado", (0.15, 0.05, 0.03), 0.0, 0.8),
        "casco": material("es_casco", (0.05, 0.12, 0.22), 0.0, 0.5),
        "casco_franja": material("es_casco_franja", (0.5, 0.06, 0.04), 0.0, 0.5),
        "cubierta": material("es_cubierta", (0.15, 0.1, 0.06), 0.0, 0.8),
        "luz_faro": luz("luz_faro", (1.0, 0.92, 0.7), 4.0),
        "luz_barca": luz("luz_barca", (1.0, 0.8, 0.5), 3.0),
        "luz_paseo": luz("luz_paseo", (1.0, 0.85, 0.62), 1.3),
        "poste_paseo": material("es_poste_paseo", (0.025, 0.035, 0.03), 0.0, 0.7),
        "luz_escaparate": luz("luz_escaparate", (1.0, 0.6, 0.28), 0.5),
    })
    for i in range(4):
        d = Pieza(f"roca_{i + 1}")
        esc = [(1.0, 1.0, 0.8), (1.4, 0.9, 0.6), (0.9, 1.2, 1.1), (1.2, 1.1, 0.5)][i]
        roca(d, m["roca"], (0, 0, 0), 1.0, esc, i + 1, sub=2, aspereza=0.4)
        d.crear(coll)
    palmera(coll, m, "palmera_1", 9.5, 0.12, 1)
    palmera(coll, m, "palmera_2", 7.5, -0.2, 2)
    palmera(coll, m, "palmera_3", 11.0, 0.05, 3)
    faro(coll, m)
    barca(coll, m)
    barandilla(coll, m)


# ---------------------------------------------------------------- desierto

def meseta(coll, m, nombre, radio, alto, semilla):
    """Meseta: estratos de roca con el contorno irregular que se van metiendo hacia arriba,
    techo plano y un faldón de derrubios al pie."""
    d = Pieza(nombre)
    n = 44
    capas = [(-2, 1.5), (alto * 0.16, 1.2), (alto * 0.3, 1.02), (alto * 0.5, 1.0), (alto * 0.75, 0.97), (alto * 0.97, 0.95), (alto, 0.9)]
    filas = []
    for z, k in capas:
        fila = []
        for i in range(n):
            a = 2 * math.pi * i / n
            # Contorno general y entrantes de la pared, que cambian un poco de estrato a estrato.
            r = radio * k * (1 + 0.28 * ruido(math.cos(a) * 1.6, math.sin(a) * 1.6, semilla)
                             + 0.1 * ruido(math.cos(a) * 6, math.sin(a) * 6, semilla + z / 25))
            # El techo no es plano del todo: escalones y mellas de hasta un 15% de la altura.
            dz = alto * 0.15 * max(-0.6, ruido(math.cos(a) * 2.5, math.sin(a) * 2.5, semilla + 9)) if z > alto * 0.9 else 0
            fila.append(Vector((math.cos(a) * r, math.sin(a) * r * 0.55, z + dz)))
        filas.append(fila)
    def mat_de(f):
        return m["roca_clara"] if abs(f.normal.z) > 0.6 else m["roca"]
    d.rejilla(filas, mat_de, cerrar=True)
    tapa = [d.bm.verts.new(p) for p in reversed(filas[-1])]
    f = d.bm.faces.new(tapa)
    f.material_index = d.idx(m["roca_clara"])
    if semilla != 1:
        # Aguja de roca suelta a un lado.
        x = radio * 1.5 * (1 if semilla % 2 else -1)
        h = alto * 0.85
        for k in range(5):
            z0, z1 = h * k / 5, h * (k + 1) / 5
            r0 = radio * 0.12 * (1.4 - k * 0.12)
            d.cilindro(m["roca"], (x, 0, z0 - 1), (x + ruido(k, semilla) * 2, 0, z1), r0, r0 * 0.9, segs=7, liso=False)
    return d.crear(coll)


def cactus(coll, m, nombre, alto, brazos, semilla):
    rng = random.Random(semilla)
    d = Pieza(nombre)
    r = 0.32
    d.cilindro(m["cactus"], (0, 0, 0), (0, 0, alto), r, r * 0.9, segs=10)
    d.esfera(m["cactus"], (0, 0, alto), r * 0.9, escala=(1, 1, 0.8), sub=2)
    for k in range(brazos):
        a = rng.uniform(0, 2 * math.pi) if k == 0 else a + math.pi + rng.uniform(-0.6, 0.6)
        z = alto * rng.uniform(0.35, 0.6)
        lado = Vector((math.cos(a), math.sin(a), 0))
        codo = Vector((0, 0, z)) + lado * rng.uniform(0.8, 1.2)
        punta = codo + Vector((0, 0, alto * rng.uniform(0.25, 0.4)))
        ra = r * 0.7
        d.cilindro(m["cactus"], Vector((0, 0, z - 0.1)), codo, ra, segs=8)
        d.esfera(m["cactus"], codo, ra * 1.02, sub=1)
        d.cilindro(m["cactus"], codo, punta, ra, ra * 0.92, segs=8)
        d.esfera(m["cactus"], punta, ra * 0.92, escala=(1, 1, 0.8), sub=1)
    return d.crear(coll)


def matorral(coll, m, nombre, semilla):
    rng = random.Random(semilla)
    d = Pieza(nombre)
    for k in range(rng.randint(6, 10)):
        c = (rng.uniform(-0.9, 0.9), rng.uniform(-0.9, 0.9), rng.uniform(0.1, 0.4))
        roca(d, m["matorral" if k % 3 else "matorral_seco"], c, rng.uniform(0.35, 0.6), (1, 1, 0.7), semilla * 10 + k, sub=1, aspereza=0.5)
    return d.crear(coll)


def poste(coll, m, vano):
    """Poste de teléfono de madera con cruceta, aisladores y tres cables hasta el siguiente
    poste, `vano` metros por delante (+Y)."""
    d = Pieza("poste")
    d.cilindro(m["madera"], (0, 0, -0.5), (0, 0, 9.2), 0.15, 0.12, segs=8)
    d.caja(m["madera"], (0, 0, 8.4), (2.4, 0.14, 0.16))
    d.cilindro(m["madera"], (-0.8, 0, 8.3), (0, 0, 7.3), 0.04, segs=4)
    d.cilindro(m["madera"], (0.8, 0, 8.3), (0, 0, 7.3), 0.04, segs=4)
    for x in (-1.05, 0, 1.05):
        z = 8.48 if x else 9.25
        d.cilindro(m["aislador"], (x, 0, z), (x, 0, z + 0.22), 0.06, 0.04, segs=6)
        p = Vector((x, 0, z + 0.2))
        d.tubo(m["cable"], catenaria(p, p + Vector((0, vano, 0)), 0.9, n=10), 0.02, segs=4)
    return d.crear(coll)


def gasolinera(coll, m):
    """Gasolinera de carretera para el lado izquierdo (la calzada queda hacia +X):
    marquesina con luces y franja, dos islas de surtidores, tienda iluminada y el poste del
    precio (cartel_gasolinera)."""
    d = Pieza("gasolinera")
    d.caja(m["hormigon"], (0, 0, 0.05), (34, 46, 0.1))  # explanada
    # Marquesina.
    cx = 6.0
    d.caja(m["blanco"], (cx, 0, 6.2), (14, 26, 0.9))
    d.caja(m["luz_franja"], (cx + 7.02, 0, 6.2), (0.04, 26, 0.35))
    d.caja(m["luz_franja"], (cx, -13.02, 6.2), (14, 0.04, 0.35))
    for x in (cx - 4, cx + 4):
        for y in (-8, 8):
            d.caja(m["blanco"], (x, y, 2.9), (0.5, 0.5, 5.8))
    for x in (cx - 4.5, cx, cx + 4.5):
        for y in range(-11, 12, 4):
            d.caja(m["luz_gasolinera"], (x, y, 5.74), (1.6, 0.6, 0.02))
    # Islas y surtidores.
    for x in (cx - 3, cx + 3):
        d.caja(m["hormigon"], (x, 0, 0.18), (1.4, 14, 0.25))
        for y in (-4, 4):
            d.caja(m["surtidor"], (x, y, 1.1), (0.8, 1.4, 1.8))
            d.caja(m["luz_rotulo"], (x - 0.41, y, 1.5), (0.02, 0.6, 0.4))
            d.caja(m["luz_rotulo"], (x + 0.41, y, 1.5), (0.02, 0.6, 0.4))
            d.caja(m["luz_franja"], (x, y, 2.1), (0.82, 1.42, 0.18))
    # Tienda al fondo.
    d.caja(m["blanco"], (-9, 4, 2.3), (9, 16, 4.6))
    d.caja(m["tejado_plano"], (-9, 4, 4.75), (9.6, 16.6, 0.3))
    d.caja(m["luz_escaparate"], (-4.47, 4, 1.7), (0.04, 12, 2.4))
    d.caja(m["luz_franja"], (-4.45, 4, 4.0), (0.04, 14, 0.5))
    # Poste del precio junto a la carretera.
    d.caja(m["acero_osc"], (14, -18, 4.5), (0.5, 0.5, 9.0))
    d.caja(m["acero_osc"], (14, -18, 10.5), (3.6, 0.5, 4.4))
    d.caja(bpy.data.materials["cartel_gasolinera"], (14, -18.26, 10.5), (3.4, 0.01, 4.2))
    return d.crear(coll)


def aerogenerador(coll, m):
    """Aerogenerador: fuste de 70 m, góndola con luz roja y, aparte, las aspas con el origen
    en el buje (el juego las hace girar). El rotor mira a -Y."""
    d = Pieza("aerogenerador")
    d.cilindro(m["blanco"], (0, 0, 0), (0, 0, 70), 2.1, 1.25, segs=16)
    d.caja(m["blanco"], (0, 1.2, 71.4), (3.2, 8.5, 3.2))
    d.esfera(m["luz_aviso"], (0, 3.8, 73.15), 0.35, sub=1)
    d.crear(coll)
    a = Pieza("aerogenerador_aspas")
    a.esfera(m["blanco"], (0, -0.6, 0), 1.3, escala=(1, 1.8, 1), sub=2)
    for k in range(3):
        ang = 2 * math.pi * k / 3
        rot = Matrix.Rotation(ang, 4, "Y")
        filas = []
        for i in range(10):
            t = i / 9
            r = 1.0 + 39 * t
            cuerda = 2.6 * (1 - t) ** 0.7 + 0.35 if t > 0.08 else 1.2
            filas.append([rot @ Vector((cuerda * 0.3, -0.9, r)), rot @ Vector((-cuerda * 0.7, -0.6, r)),
                          rot @ Vector((cuerda * 0.3, -0.5, r))])
        a.rejilla(filas, lambda f: m["blanco"], cerrar=True)
    a.crear(coll, pos=(0, -2.0, 71.4))


def grupo_desierto(coll):
    m = mats()
    m.update({
        "roca": material("es_roca_desierto", (0.13, 0.065, 0.035), 0.0, 0.95),
        "roca_clara": material("es_roca_desierto_clara", (0.2, 0.11, 0.06), 0.0, 0.95),
        "cactus": material("es_cactus", (0.04, 0.075, 0.035), 0.0, 0.75),
        "matorral": material("es_matorral", (0.05, 0.055, 0.025), 0.0, 0.9),
        "matorral_seco": material("es_matorral_seco", (0.09, 0.07, 0.04), 0.0, 0.9),
        "madera": material("es_madera", (0.09, 0.06, 0.04), 0.0, 0.9),
        "aislador": material("es_aislador", (0.15, 0.3, 0.2), 0.0, 0.2),
        "cable": material("es_cable", (0.02, 0.02, 0.02), 0.0, 0.6),
        "blanco": material("es_blanco", (0.62, 0.62, 0.6), 0.0, 0.6),
        "tejado_plano": material("es_tejado_plano", (0.08, 0.08, 0.09), 0.0, 0.8),
        "surtidor": material("es_surtidor", (0.3, 0.3, 0.32), 0.3, 0.4),
        "luz_gasolinera": luz("luz_gasolinera", (0.92, 0.96, 1.0), 2.6),
        "luz_franja": luz("luz_franja", (1.0, 0.18, 0.12), 1.8),
        "luz_rotulo": luz("luz_rotulo", (0.75, 0.88, 1.0), 1.1),
        "luz_escaparate": luz("luz_escaparate", (1.0, 0.6, 0.28), 0.5),
    })
    material("cartel_gasolinera", (0.9, 0.9, 0.9), 0.0, 0.5)
    meseta(coll, m, "meseta_1", 90, 55, 1)
    meseta(coll, m, "meseta_2", 60, 38, 2)
    meseta(coll, m, "meseta_3", 130, 70, 3)
    cactus(coll, m, "cactus_1", 6.5, 2, 1)
    cactus(coll, m, "cactus_2", 4.2, 1, 2)
    cactus(coll, m, "cactus_3", 7.5, 3, 3)
    matorral(coll, m, "matorral_1", 1)
    matorral(coll, m, "matorral_2", 2)
    poste(coll, m, 40.0)
    gasolinera(coll, m)
    aerogenerador(coll, m)


# ---------------------------------------------------------------- montaña

TRAMO = 40.0  # largo de los tramos de ladera y talud (se repiten sin costura)
VALLE = -46.0  # fondo del valle; el suelo del juego baja a -45 en este escenario
MEDIA_4 = 6.8  # media calzada con 4 carriles


def pino_en(d, m, base, alto, semilla):
    """Pino: tronco y cinco pisos de copa en cono, algo torcidos."""
    rng = random.Random(semilla)
    base = Vector(base)
    d.cilindro(m["tronco"], base - Vector((0, 0, 0.5)), base + Vector((0, 0, alto * 0.35)), alto * 0.025, segs=6, liso=False)
    pisos = 5
    for k in range(pisos):
        t = k / pisos
        z0 = alto * (0.18 + 0.68 * t)
        r = alto * 0.24 * (1 - t * 0.75)
        off = Vector((rng.uniform(-0.1, 0.1), rng.uniform(-0.1, 0.1), 0)) * alto * 0.1
        d.cilindro(m["pino" if k % 2 else "pino_osc"], base + off + Vector((0, 0, z0)), base + off + Vector((0, 0, z0 + alto * 0.32)),
                   r, 0.02, segs=rng.choice((7, 8, 9)), liso=False)


def terreno(d, m, perfil, amp, semilla, comun=101, filas=17):
    """Tramo de terreno de TRAMO m a lo largo de Y con un perfil (x, z) y ruido periódico.
    Cerca de los extremos el ruido pasa a uno común a todas las variantes, así cualquier tramo
    empalma con cualquier otro. Devuelve los puntos de la superficie para posar cosas encima."""
    rejilla = []
    for i in range(filas):
        y = -TRAMO / 2 + TRAMO * i / (filas - 1)
        w = min(1.0, abs(y) / (TRAMO / 2)) ** 3  # 0 en el centro, 1 en los bordes
        fila = []
        for j, (x, z) in enumerate(perfil):
            a = amp(z)
            nv = ruido(x * 0.08, y, z * 0.08 + semilla * 5, periodo=TRAMO)
            nc = ruido(x * 0.08, y, z * 0.08 + comun * 5, periodo=TRAMO)
            n = nv * (1 - w) + nc * w
            nz = ruido(x * 0.08 + 3, y, z * 0.08 + semilla * 5, periodo=TRAMO) * (1 - w) + \
                 ruido(x * 0.08 + 3, y, z * 0.08 + comun * 5, periodo=TRAMO) * w
            fila.append(Vector((x + n * a, y, z + nz * a * 0.4)))
        rejilla.append(fila)
    d.rejilla(rejilla, lambda f: m["roca"] if abs(f.normal.z) < 0.55 else m["hierba"])
    # Tapas con la sección en los dos extremos: se ven donde empieza o acaba una tanda de
    # tramos (junto al viaducto); entre dos tramos seguidos quedan escondidas.
    # Cada tapa va por las dos caras: suelta, el recálculo de normales no sabe hacia dónde mira.
    for fila in (rejilla[0], rejilla[-1]):
        for orden in (fila, list(reversed(fila))):
            f = d.bm.faces.new([d.bm.verts.new(p) for p in orden])
            f.material_index = d.idx(m["roca"])
    return rejilla


def ladera(coll, m, nombre, semilla):
    """Pared de roca del lado izquierdo (la calzada queda hacia +X), con pinos arriba."""
    d = Pieza(nombre)
    perfil = [(0.4, -3), (0, -0.35), (-1.2, -0.35), (-1.7, 2.5), (-2.6, 7), (-3.8, 12), (-5.6, 17), (-8.6, 22),
              (-13, 26.5), (-20, 30.5), (-30, 33.5), (-45, 35.5), (-62, 36.5), (-62, VALLE)]
    sup = terreno(d, m, perfil, lambda z: 0.0 if z < 0 else min(3.0, 0.6 + z * 0.09), semilla)
    rng = random.Random(semilla)
    for _ in range(9):
        fila = sup[rng.randint(1, len(sup) - 2)]
        p = fila[rng.randint(8, 11)]
        pino_en(d, m, p, rng.uniform(9, 15), rng.random())
    return d.crear(coll)


def talud(coll, m, nombre, semilla):
    """Talud que baja al valle por el lado derecho, con pinos en la pendiente."""
    d = Pieza(nombre)
    perfil = [(-0.4, -3), (0, -0.35), (1.6, -0.35), (3, -1.6), (6, -5), (11, -11), (18, -19), (27, -28),
              (38, -37), (52, -43.5), (70, VALLE)]
    sup = terreno(d, m, perfil, lambda z: 0.0 if z > -0.5 else min(3.5, 0.8 - z * 0.06), semilla + 50)
    rng = random.Random(semilla + 50)
    for _ in range(10):
        fila = sup[rng.randint(1, len(sup) - 2)]
        p = fila[rng.randint(3, 9)]
        pino_en(d, m, p, rng.uniform(10, 17), rng.random())
    return d.crear(coll)


def tunel(coll, m, largo=150.0):
    """Túnel de `largo` m a lo largo de Y con la boca en -Y (hacia quien llega): tubo
    abovedado con zócalo de azulejo, aceras, luces en el techo, muro frontal con la señal
    (cartel_tunel) y los semáforos de carril, y el monte encima."""
    d = Pieza("tunel")
    W = MEDIA_4 + 2.2
    y0, y1 = -largo / 2, largo / 2
    cortes = int(largo / 5)
    def arco(r, n=12):
        pts = [(W + r, -0.3), (W + r, 5.0)]
        for k in range(1, n):
            a = math.pi * k / n
            pts.append(((W + r) * math.cos(a), 5.0 + (4.0 + r) * math.sin(a)))
        pts += [(-(W + r), 5.0), (-(W + r), -0.3)]
        return pts
    interior, exterior = arco(0), arco(0.8)
    d.perfil(m["hormigon"], interior + list(reversed(exterior)), y0, y1, cortes=cortes)
    for s in (-1, 1):
        d.perfil(m["azulejo"], [(s * (W - 0.05), 0.0), (s * (W - 0.02), 0.0), (s * (W - 0.02), 3.4), (s * (W - 0.05), 3.4)], y0 + 0.5, y1, cortes=cortes)
        d.perfil(m["hormigon_osc"], [(s * W, -0.3), (s * (W - 1.0), -0.3), (s * (W - 1.0), 0.0), (s * W, 0.0)], y0, y1, cortes=cortes)
        x = s * 5.5
        z = 5.0 + 4.0 * math.sqrt(1 - (5.5 / W) ** 2) - 0.12
        for k in range(int(largo / 7)):
            d.caja(m["luz_tunel"], (x, y0 + 3 + k * 7, z), (0.5, 2.2, 0.1))
        for k in range(1, int(largo / 50) + 1):
            d.caja(m["luz_salida"], (s * (W - 0.03), y0 + k * 50 - 25, 2.6), (0.05, 0.9, 0.4))
    # Muro frontal con el hueco de la boca (dos mitades, cada una rodea medio hueco).
    hueco = arco(0.8)
    mitad_d = [p for p in hueco if p[0] >= 0]
    cara = [(0, VALLE), (0, -0.3), (W + 0.8, -0.3)] + [(x, z) for x, z in mitad_d if z > -0.3] + [(0, 26), (32, 26), (32, VALLE)]
    d.perfil(m["hormigon"], list(reversed(cara)), y0 - 1.5, y0)
    d.perfil(m["hormigon"], [(-x, z) for x, z in cara], y0 - 1.5, y0)
    d.caja(m["hormigon_osc"], (0, y0 - 1.6, 26.2), (64.5, 1.8, 0.5))  # albardilla
    # Señal azul del túnel y semáforos de carril.
    d.caja(m["acero_osc"], (0, y0 - 1.7, 13.4), (7.4, 0.2, 2.0))
    d.caja(bpy.data.materials["cartel_tunel"], (0, y0 - 1.81, 13.4), (7.2, 0.01, 1.8))
    d.caja(m["acero_osc"], (0, y0 - 1.9, 11.2), (W * 2 - 2, 0.4, 0.5))
    for k in range(4):
        x = (k - 1.5) * 3.4
        d.caja(m["acero_osc"], (x, y0 - 2.1, 11.0), (0.9, 0.5, 0.9))
        d.caja(m["luz_semaforo"], (x, y0 - 2.36, 11.0), (0.5, 0.02, 0.5))
    # Monte encima: el frente se queda a la altura del muro y detrás sube.
    filas = []
    n = 24
    for i in range(9):
        y = y0 - 1.0 + (largo + 1.0) * i / 8
        fila = []
        for j in range(n + 1):
            x = -90 + 180 * j / n
            alto = 12 + 52 * max(0.0, 1 - (abs(x) / 82) ** 1.6) + 6 * ruido(x * 0.04, y * 0.04, 7)
            if abs(x) > 82:
                alto = VALLE
            if i == 0:
                alto = min(alto, 26.0) if abs(x) <= 32 else VALLE
            fila.append(Vector((x, y, alto)))
        filas.append(fila)
    d.rejilla(filas, lambda f: m["roca"] if abs(f.normal.z) < 0.6 else m["hierba"])
    return d.crear(coll)


def viaducto(coll, m, largo=120.0):
    """Tramo de viaducto: cajón bajo la calzada, barandillas, pilas que bajan al valle y el
    río en el fondo."""
    d = Pieza("viaducto")
    y0, y1 = -largo / 2, largo / 2
    cortes = int(largo / 5)
    E = MEDIA_4 + 2.7
    d.perfil(m["hormigon"], [(-E, -0.3), (E, -0.3), (E, -1.3), (E - 3, -3.8), (-E + 3, -3.8), (-E, -1.3)], y0, y1, cortes=cortes)
    for s in (-1, 1):
        d.perfil(m["hormigon_osc"], [(s * E, -0.32), (s * (E - 1.2), -0.32), (s * (E - 1.2), -0.1), (s * E, -0.1)], y0, y1, cortes=cortes)
        for z in (0.55, 1.05):
            d.perfil(m["acero"], [(s * (E - 0.2), z), (s * (E - 0.1), z), (s * (E - 0.1), z + 0.08), (s * (E - 0.2), z + 0.08)], y0, y1, cortes=cortes)
        for k in range(int(largo / 2.5) + 1):
            y = y0 + k * 2.5
            d.cilindro(m["acero"], (s * (E - 0.15), y, -0.1), (s * (E - 0.15), y, 1.15), 0.04, segs=4)
    for y in (y0 + 20, 0.0, y1 - 20):
        d.caja(m["hormigon"], (0, y, -4.6), (E * 2 - 4, 3.2, 1.6))
        for x in (-4.2, 4.2):
            d.cilindro(m["hormigon"], (x, y, VALLE), (x, y, -5.4), 1.7, 1.25, segs=8, liso=False)
    d.caja(m["agua"], (0, 0, VALLE + 1.25), (420, 26, 0.05))
    return d.crear(coll)


def poste_sos(coll, m):
    """Poste SOS naranja con su luz, para dejar junto a las bocas de los túneles."""
    d = Pieza("poste_sos")
    d.caja(m["hormigon"], (0, 0, 0.15), (1.0, 0.8, 0.3))
    d.caja(m["naranja"], (0, 0, 1.15), (0.7, 0.5, 1.7))
    d.caja(bpy.data.materials["cartel_sos"], (0, -0.255, 1.55), (0.5, 0.01, 0.3))
    d.caja(m["acero_osc"], (0, -0.26, 1.05), (0.35, 0.02, 0.45))
    d.cilindro(m["acero_osc"], (0, 0, 2.0), (0, 0, 2.5), 0.05, segs=6)
    d.esfera(m["luz_sos"], (0, 0, 2.6), 0.12, sub=1)
    return d.crear(coll)


def montana(coll, m, nombre, ancho, alto, semilla):
    """Cordillera lejana: una cresta con picos de ancho x alto m."""
    d = Pieza(nombre)
    n = 48
    filas = []
    for fondo, k in ((-40, 0.0), (0, 1.0), (60, 0.55)):
        fila = []
        for j in range(n + 1):
            x = -ancho / 2 + ancho * j / n
            borde = 1 - (abs(x) / (ancho / 2)) ** 2
            h = alto * borde * (0.55 + 0.45 * ruido(x * 0.01, semilla, 0) + 0.2 * ruido(x * 0.04, semilla, 3))
            fila.append(Vector((x, fondo, -2 + max(0, h) * k)))
        filas.append(fila)
    d.rejilla(filas, lambda f: m["roca_lejos"])
    return d.crear(coll)


def grupo_montana(coll):
    m = mats()
    m.update({
        "roca": material("es_roca_montana", (0.07, 0.07, 0.075), 0.0, 0.95),
        "roca_lejos": material("es_roca_lejos", (0.03, 0.035, 0.05), 0.0, 1.0),
        "hierba": material("es_hierba_noche", (0.03, 0.045, 0.025), 0.0, 1.0),
        "tronco": material("es_tronco", (0.12, 0.09, 0.06), 0.0, 0.9),
        "pino": material("es_pino", (0.02, 0.05, 0.03), 0.0, 0.85),
        "pino_osc": material("es_pino_osc", (0.012, 0.035, 0.022), 0.0, 0.9),
        "azulejo": material("es_azulejo", (0.42, 0.42, 0.4), 0.0, 0.35),
        "agua": material("es_agua", (0.01, 0.02, 0.03), 0.6, 0.12),
        "naranja": material("es_naranja", (0.6, 0.18, 0.02), 0.0, 0.5),
        "luz_tunel": luz("luz_tunel", (1.0, 0.72, 0.4), 2.6),
        "luz_salida": luz("luz_salida", (0.2, 1.0, 0.45), 1.5),
        "luz_semaforo": luz("luz_semaforo", (0.2, 1.0, 0.4), 2.2),
        "luz_sos": luz("luz_sos", (1.0, 0.6, 0.2), 2.0),
    })
    material("cartel_tunel", (0.05, 0.15, 0.5), 0.0, 0.5)
    material("cartel_sos", (0.9, 0.9, 0.9), 0.0, 0.5)
    for i in range(3):
        ladera(coll, m, f"ladera_{i + 1}", i + 1)
        talud(coll, m, f"talud_{i + 1}", i + 1)
    tunel(coll, m)
    viaducto(coll, m)
    poste_sos(coll, m)
    for i in range(2):
        d = Pieza(f"pino_{i + 1}")
        pino_en(d, m, (0, 0, 0), [12, 16][i], i)
        d.crear(coll)
    montana(coll, m, "montana_1", 700, 260, 1)
    montana(coll, m, "montana_2", 520, 200, 2)


# ---------------------------------------------------------------- grupos y exportación

def grupo_comun(coll):
    m = mats()
    for i in (1, 2):
        material("cartel_salida_%d" % i, (0.02, 0.18, 0.08), 0.0, 0.5)
    farola(coll, m)
    quitamiedos(coll, m)
    portico(coll, m)
    neon_radio(coll, m)
    paso_elevado(coll, m)
    pantalla(coll, m)


GRUPOS = {"comun": grupo_comun, "ciudad": grupo_ciudad, "costa": grupo_costa, "desierto": grupo_desierto, "montana": grupo_montana}


def construir(nombre, guardar=True):
    random.seed(nombre)
    scn = bpy.data.scenes.get(nombre) or bpy.data.scenes.new(nombre)
    win = bpy.context.window
    win.scene = scn
    for o in list(scn.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for c in list(scn.collection.children):
        scn.collection.children.unlink(c)
    coll = bpy.data.collections.new(f"escenario_{nombre}")
    scn.collection.children.link(coll)
    GRUPOS[nombre](coll)
    vl = scn.view_layers[0]
    win.view_layer = vl
    vl.active_layer_collection = vl.layer_collection.children[coll.name]
    path = os.path.join(REPO, "public", "models", f"escenario_{nombre}.glb")
    if guardar:
        bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=False, use_active_collection=True,
                                  use_active_scene=True, export_apply=True, export_yup=True)
        os.makedirs(os.path.join(REPO, "assets", "blender"), exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(REPO, "assets", "blender", "escenarios.blend"), copy=True)
        print(f"{nombre}: {os.path.getsize(path) // 1024} KB -> {path}")
    return coll
