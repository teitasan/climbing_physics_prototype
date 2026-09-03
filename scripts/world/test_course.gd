class_name TestCourse
extends Node3D

var spawn_position := Vector3(0.0, 0.4, 2.0)


func _ready() -> void:
	name = "TestCourse"
	_build()


func _build() -> void:
	# Ground plaza and linear course toward +Z.
	_box(Vector3(0, -0.25, 28), Vector3(28, 0.5, 72), Color(0.33, 0.34, 0.36), "Ground")
	_label(Vector3(0, 2.2, 2), "START\nWalk / Run / Jump")

	# 1. Gentle slope
	_ramp(Vector3(0, 0.0, 10), Vector3(4.0, 0.2, 6.0), -18.0, Color(0.78, 0.52, 0.28), "Slope")
	_label(Vector3(0, 1.6, 10), "Slope")

	# 2. Low / medium steps (step-up, not climb)
	_box(Vector3(0, 0.15, 15.2), Vector3(2.2, 0.30, 1.1), Color(0.85, 0.75, 0.25), "StepLow")
	_box(Vector3(0, 0.35, 16.4), Vector3(2.2, 0.50, 1.1), Color(0.82, 0.62, 0.18), "StepMid")
	_label(Vector3(0, 1.8, 16.0), "Steps")

	# 3. Jump gap
	_box(Vector3(0, 0.2, 18.4), Vector3(2.4, 0.4, 1.6), Color(0.45, 0.7, 0.4), "GapA")
	_box(Vector3(0, 0.2, 21.6), Vector3(2.4, 0.4, 1.6), Color(0.45, 0.7, 0.4), "GapB")
	_label(Vector3(0, 1.9, 20.0), "Jump gap")

	# 4. Low mantle wall (chest-high, jump + grab + climb up)
	_box(Vector3(0, 0.62, 24.3), Vector3(4.0, 1.24, 0.7), Color(0.22, 0.62, 0.66), "LowWall")
	_box(Vector3(0, 1.24, 26.3), Vector3(4.0, 0.28, 3.4), Color(0.28, 0.7, 0.62), "LowDeck")
	_label(Vector3(0, 2.6, 24.3), "Ledge grab + Mantle")

	# 5. Cat hang traverse: vertical wall with a thin top lip, wall under feet
	_box(Vector3(0, 1.05, 30.6), Vector3(8.4, 2.10, 0.55), Color(0.25, 0.42, 0.82), "TraverseWall")
	_box(Vector3(0, 2.16, 30.45), Vector3(8.4, 0.16, 0.28), Color(0.55, 0.75, 1.0), "TraverseLedge")
	_label(Vector3(0, 3.4, 30.6), "Cat Hang  /  A-D Traverse")

	# Landing after traverse (right side has a mantle-able cap)
	_box(Vector3(4.6, 2.2, 30.9), Vector3(1.6, 0.28, 1.8), Color(0.35, 0.78, 0.7), "TraverseMantlePad")

	# 6. Free hang overhang: floating slab with no wall down to the floor
	_box(Vector3(-2.2, 1.95, 34.8), Vector3(2.8, 0.42, 1.4), Color(0.62, 0.32, 0.82), "Overhang")
	_label(Vector3(-2.2, 3.1, 34.8), "Free Hang (overhang)")

	# 7. Jump-grab pair: two walls you hop between
	_box(Vector3(-1.5, 1.05, 38.4), Vector3(1.5, 2.10, 0.5), Color(0.18, 0.72, 0.42), "PillarA")
	_box(Vector3(-1.5, 2.16, 38.22), Vector3(1.5, 0.16, 0.28), Color(0.45, 0.95, 0.6), "PillarALedge")
	_box(Vector3(1.5, 1.05, 38.4), Vector3(1.5, 2.10, 0.5), Color(0.18, 0.72, 0.42), "PillarB")
	_box(Vector3(1.5, 2.16, 38.22), Vector3(1.5, 0.16, 0.28), Color(0.45, 0.95, 0.6), "PillarBLedge")
	_label(Vector3(0.0, 3.5, 38.4), "Jump Grab  (Space + A/D)")

	# 8. High mantle tower
	_box(Vector3(0, 1.15, 42.4), Vector3(2.6, 2.30, 1.4), Color(0.2, 0.55, 0.48), "HighWall")
	_box(Vector3(0, 2.40, 43.6), Vector3(2.8, 0.3, 2.6), Color(0.3, 0.7, 0.55), "HighDeck")
	_label(Vector3(0, 3.6, 42.2), "High Mantle")

	# 9. Slightly out-of-reach stretch ledge (needs jump + magnet)
	_box(Vector3(2.8, 1.55, 47.2), Vector3(1.8, 3.10, 0.55), Color(0.75, 0.45, 0.18), "StretchWall")
	_box(Vector3(2.8, 3.18, 47.05), Vector3(1.8, 0.16, 0.30), Color(0.95, 0.7, 0.25), "StretchLedge")
	_label(Vector3(2.8, 4.3, 47.2), "Stretch grab")

	# 10. Unclimbable blank wall, with a walk-around
	_box(Vector3(0, 2.5, 51.5), Vector3(6.0, 5.0, 0.7), Color(0.45, 0.12, 0.12), "NoClimb")
	_box(Vector3(-4.6, 0.2, 51.5), Vector3(3.2, 0.4, 3.0), Color(0.4, 0.4, 0.42), "Detour")
	_label(Vector3(0, 5.4, 51.5), "Unclimbable (walk around)")

	# 11. Goal
	_box(Vector3(0, 0.35, 56.5), Vector3(4.5, 0.7, 4.5), Color(0.92, 0.78, 0.22), "Goal")
	_label(Vector3(0, 2.4, 56.5), "GOAL")

	# Extra: rotated block so detection is not cube-axis-only
	var skewed := _box(Vector3(6.2, 1.0, 26.0), Vector3(1.6, 2.0, 0.6), Color(0.5, 0.55, 0.35), "SkewWall")
	skewed.rotation_degrees.y = 28.0

	# CSG wall (collision from CSG) to prove non-box colliders work
	var csg := CSGBox3D.new()
	csg.name = "CSGClimb"
	csg.size = Vector3(2.2, 1.8, 0.6)
	csg.position = Vector3(-6.0, 0.9, 26.0)
	csg.use_collision = true
	csg.collision_layer = 1
	csg.collision_mask = 0
	var csg_mat := StandardMaterial3D.new()
	csg_mat.albedo_color = Color(0.4, 0.55, 0.7)
	csg.material = csg_mat
	add_child(csg)
	_label(Vector3(-6.0, 2.5, 26.0), "CSG wall")

	_sun_shadow_catcher()


func _box(pos: Vector3, size: Vector3, color: Color, nam: String) -> StaticBody3D:
	var body := StaticBody3D.new()
	body.name = nam
	body.collision_layer = 1
	body.collision_mask = 0
	body.position = pos
	var mi := MeshInstance3D.new()
	var mesh := BoxMesh.new()
	mesh.size = size
	mi.mesh = mesh
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mat.roughness = 0.72
	mat.metallic = 0.05
	mi.material_override = mat
	var col := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = size
	col.shape = shape
	body.add_child(mi)
	body.add_child(col)
	add_child(body)
	return body


func _ramp(pos: Vector3, size: Vector3, pitch_deg: float, color: Color, nam: String) -> void:
	var body := _box(pos, size, color, nam)
	body.rotation_degrees.x = pitch_deg


func _label(pos: Vector3, text: String) -> void:
	var l := Label3D.new()
	l.text = text
	l.font_size = 42
	l.modulate = Color(1, 1, 1)
	l.outline_size = 8
	l.outline_modulate = Color(0, 0, 0, 0.75)
	l.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	l.position = pos
	l.no_depth_test = true
	add_child(l)


func _sun_shadow_catcher() -> void:
	var deco := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(80, 90)
	deco.mesh = plane
	deco.position = Vector3(0, -0.51, 20)
	deco.rotation_degrees.x = -90
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.18, 0.2, 0.16)
	mat.roughness = 1.0
	deco.material_override = mat
	add_child(deco)
