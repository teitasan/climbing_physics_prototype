class_name ClimbDebug
extends Node3D

var player: Player
var im: ImmediateMesh
var mi: MeshInstance3D
var labels: Array[Label3D] = []
var spheres: Array[MeshInstance3D] = []
var _mat: StandardMaterial3D
var _wrote := false


func setup(p: Player) -> void:
	player = p
	im = ImmediateMesh.new()
	mi = MeshInstance3D.new()
	mi.mesh = im
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)
	_mat = StandardMaterial3D.new()
	_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_mat.vertex_color_use_as_albedo = true
	_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_mat.no_depth_test = true
	_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	for i in 10:
		var lab := Label3D.new()
		lab.font_size = 18
		lab.modulate = Color(1, 0.85, 0.3)
		lab.outline_modulate = Color(0, 0, 0, 0.8)
		lab.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		lab.no_depth_test = true
		lab.visible = false
		add_child(lab)
		labels.append(lab)
	for i in 8:
		var s := MeshInstance3D.new()
		var mesh := SphereMesh.new()
		mesh.radius = 0.06
		mesh.height = 0.12
		s.mesh = mesh
		var mat := StandardMaterial3D.new()
		mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		s.material_override = mat
		s.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		s.visible = false
		add_child(s)
		spheres.append(s)


func sync() -> void:
	im.clear_surfaces()
	for lab in labels:
		lab.visible = false
	for s in spheres:
		s.visible = false
	if player == null or not player.debug_enabled:
		return
	_wrote = false
	im.surface_begin(Mesh.PRIMITIVE_LINES, _mat)
	var detector := player.detector
	if detector:
		for probe in detector.probes:
			if probe.label == "wall" and not probe.hit:
				continue
			if probe.label == "lip_up" and not probe.hit:
				continue
			var col: Color = probe.color
			if probe.hit:
				_line(probe.from, probe.hit_pos, col)
				_line(probe.hit_pos, probe.hit_pos + probe.hit_normal * 0.28, Color(1, 1, 1, 0.8))
			elif probe.kind == "target" or probe.label in ["foot_support", "top", "edge", "mantle_ground"]:
				_line(probe.from, probe.to, Color(col.r, col.g, col.b, col.a * 0.45))
		var ti := 0
		if detector.last_best and detector.last_best.valid:
			var t: ClimbTarget = detector.last_best
			_line(t.ledge_point, t.ledge_point + t.wall_normal * 0.55, Color(0.2, 1.0, 0.4))
			_line(t.hand_left, t.hand_right, Color(1.0, 0.9, 0.2))
			_line(t.hang_pelvis, t.ledge_point, Color(0.6, 0.8, 1.0))
			_mark(0, t.ledge_point, Color(0.2, 1.0, 0.3), "LEDGE")
			_mark(1, t.hand_left, Color(1.0, 0.85, 0.1), "LH")
			_mark(2, t.hand_right, Color(1.0, 0.85, 0.1), "RH")
			_mark(3, t.foot_left, Color(1.0, 0.45, 0.1), "LF")
			_mark(4, t.foot_right, Color(1.0, 0.45, 0.1), "RF")
			if t.can_mantle:
				_mark(5, t.stand_position, Color(0.4, 1.0, 0.8), "MANTLE")
			_label_at(0, t.ledge_point + Vector3.UP * 0.22, t.hang_style_name())
			ti = 1
		for probe in detector.probes:
			if probe.kind == "reason" and ti < labels.size():
				_label_at(ti, probe.hit_pos + Vector3.UP * 0.12, probe.label)
				ti += 1
				if ti >= 6:
					break
	if not _wrote:
		im.surface_set_color(Color(0, 0, 0, 0))
		im.surface_add_vertex(Vector3.ZERO)
		im.surface_add_vertex(Vector3.ZERO)
	im.surface_end()


func _line(a: Vector3, b: Vector3, color: Color) -> void:
	im.surface_set_color(color)
	im.surface_add_vertex(to_local(a))
	im.surface_set_color(color)
	im.surface_add_vertex(to_local(b))
	_wrote = true


func _mark(i: int, pos: Vector3, color: Color, _tag: String) -> void:
	if i < 0 or i >= spheres.size():
		return
	var s := spheres[i]
	s.visible = true
	s.global_position = pos
	(s.material_override as StandardMaterial3D).albedo_color = color


func _label_at(i: int, pos: Vector3, text: String) -> void:
	if i < 0 or i >= labels.size():
		return
	labels[i].visible = true
	labels[i].global_position = pos
	labels[i].text = text
