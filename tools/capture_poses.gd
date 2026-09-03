extends SceneTree

## Renders the playable character from a photo camera and writes PNGs.
## Usage: godot --path . --resolution 1280x720 -s res://tools/capture_poses.gd -- TAG


const OUT_DIR := "res://tmp/pose_shots"

var tag := "shot"
var player: Player
var photo: Camera3D
var out_abs := ""


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	if not args.is_empty():
		tag = args[0]
	call_deferred("_run")


func _run() -> void:
	root.size = Vector2i(1280, 720)
	DisplayServer.window_set_size(Vector2i(1280, 720))
	out_abs = ProjectSettings.globalize_path(OUT_DIR)
	DirAccess.make_dir_recursive_absolute(out_abs)
	var packed := load("res://scenes/main.tscn")
	if packed == null:
		push_error("main.tscn missing")
		quit(1)
		return
	root.add_child(packed.instantiate())
	for i in 50:
		await physics_frame
		player = root.find_child("Player", true, false)
		if player and player.state_name() == "Grounded":
			break
	if player == null:
		push_error("no player")
		quit(1)
		return
	player.debug_enabled = false
	if player.hud:
		player.hud.visible = false
	_dump_bones()
	print("YAW ", player.visuals.facing_yaw, " FACE_DIR ", player.visuals.facing_dir())
	await _shot_tps("tps_idle")
	_hold("move_forward", true)
	for i in 24:
		await physics_frame
	print("WALK yaw=", player.visuals.facing_yaw, " face=", player.visuals.facing_dir(), " wish=", player.wish_dir)
	await _shot_tps("tps_walk")
	_hold("move_forward", false)

	_make_photo_cam()
	await _settle()

	player.reset_to_spawn()
	for i in 20:
		await physics_frame
	player.visuals.snap_facing(Vector3(0, 0, 1))
	await _shot("idle_behind", Vector3(-1.2, 0.7, -3.2))
	await _shot("idle_side", Vector3(2.8, 1.0, -0.4))

	_hold("move_forward", true)
	player.sprinting = true
	for i in 28:
		await physics_frame
	await _shot("walk", Vector3(-1.8, 1.4, 5.2))
	_hold("move_forward", false)
	player.sprinting = false

	player.visuals.auto_animate = false
	player.visuals.rest_pose()
	player.global_position = Vector3(0.0, 0.4, 2.0)
	player.velocity = Vector3.ZERO
	player.visuals.snap_facing(Vector3(0, 0, 1))
	await _settle()
	await _shot("rest", Vector3(-1.6, 1.35, 3.6))
	player.visuals.apply_test_rot("LeftUpLeg", Vector3(0.8, 0.0, 0.0))
	await _shot("test_thigh_x", Vector3(2.4, 1.1, 2.0))
	player.visuals.rest_pose()
	player.visuals.apply_test_rot("LeftArm", Vector3(0.8, 0.0, 0.0))
	await _shot("test_arm_x", Vector3(-1.6, 1.4, 3.4))
	player.visuals.rest_pose()
	player.visuals.apply_test_rot("LeftArm", Vector3(0.0, 0.0, 0.8))
	await _shot("test_arm_z", Vector3(-1.6, 1.4, 3.4))
	player.visuals.rest_pose()
	player.visuals.apply_test_rot("LeftArm", Vector3(0.0, 0.8, 0.0))
	await _shot("test_arm_y", Vector3(-1.6, 1.4, 3.4))
	player.visuals.auto_animate = true
	player.reset_to_spawn()
	for i in 24:
		await physics_frame
	player.global_position = Vector3(0.0, 0.4, 22.7)
	player.velocity = Vector3(0, 0, 3.5)
	player.visuals.snap_facing(Vector3(0, 0, 1))
	player.camera_rig.yaw = PI
	_hold("move_forward", true)
	_press("jump")
	for i in 90:
		await physics_frame
		if player.state_name() == "Hang":
			break
	_hold("move_forward", false)
	print("HANG_STATE ", player.state_name(), " style=", player.hang_style, " ik=", player.ik_weight, " pos=", player.global_position)
	if player.active_target:
		print("HANG wall_n=", player.active_target.wall_normal, " face=", player.active_target.facing_dir(), " vis_dir=", player.visuals.facing_dir(), " yaw=", player.visuals.facing_yaw)
	await _shot("hang", Vector3(-2.4, 0.55, -2.6))
	await _shot("hang_side", Vector3(2.6, 0.45, -0.2))
	await _shot("hang_front", Vector3(0.2, 0.7, 3.2))

	print("CAPTURE_OK ", out_abs)
	quit(0)


func _shot_tps(label: String) -> void:
	if player.camera_rig and player.camera_rig.camera:
		if photo:
			photo.current = false
		player.camera_rig.camera.current = true
	await _settle()
	var path := "%s/%s_%s.png" % [out_abs, tag, label]
	var img := root.get_texture().get_image()
	if img == null:
		push_error("no viewport image for " + label)
		return
	img.save_png(path)
	print("WROTE ", path)


func _make_photo_cam() -> void:
	photo = Camera3D.new()
	photo.name = "PhotoCam"
	photo.fov = 42.0
	photo.near = 0.05
	photo.far = 200.0
	root.add_child(photo)
	if player.camera_rig and player.camera_rig.camera:
		player.camera_rig.camera.current = false
	photo.current = true


func _aim(offset: Vector3) -> void:
	var look := player.global_position + Vector3(0.0, 0.95, 0.0)
	photo.global_position = look + offset
	photo.look_at(look, Vector3.UP)


func _shot(label: String, offset: Vector3) -> void:
	_aim(offset)
	await _settle()
	var path := "%s/%s_%s.png" % [out_abs, tag, label]
	var img := root.get_texture().get_image()
	if img == null:
		push_error("no viewport image for " + label)
		return
	img.save_png(path)
	print("WROTE ", path)


func _settle() -> void:
	for i in 8:
		await process_frame
	await RenderingServer.frame_post_draw
	await process_frame
	await RenderingServer.frame_post_draw


func _dump_bones() -> void:
	var skel: Skeleton3D = player.visuals.skeleton
	if skel == null:
		print("NO_SKELETON")
		return
	print("HAIR ", player.visuals.find_child("Hair_SimpleParted", true, false))
	for logical in ["Hips", "LeftArm", "LeftForeArm", "LeftHand", "LeftUpLeg", "LeftLeg", "LeftFoot", "Head"]:
		var idx := int(player.visuals._bone.get(logical, -1))
		if idx < 0:
			print("BONE_MISS ", logical)
			continue
		var rest := skel.get_bone_rest(idx)
		var g := skel.get_bone_global_pose(idx)
		var child_dir := Vector3.ZERO
		for j in skel.get_bone_count():
			if skel.get_bone_parent(j) == idx:
				child_dir = skel.get_bone_rest(j).origin
				break
		print(
			"BONE ", logical, " name=", skel.get_bone_name(idx),
			" rest_e=", rest.basis.get_euler(),
			" child=", child_dir,
			" gpos=", g.origin,
			" world=", (skel.global_transform * g).origin
		)


func _press(action: String) -> void:
	var ev := InputEventAction.new()
	ev.action = action
	ev.pressed = true
	Input.parse_input_event(ev)
	ev = InputEventAction.new()
	ev.action = action
	ev.pressed = false
	Input.parse_input_event(ev)


func _hold(action: String, pressed: bool) -> void:
	var ev := InputEventAction.new()
	ev.action = action
	ev.pressed = pressed
	Input.parse_input_event(ev)
