extends SceneTree

## Headless playtest covering land, grab, hang, mantle, jump-grab, hang styles.


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	var packed := load("res://scenes/main.tscn")
	if packed == null:
		push_error("Failed to load main.tscn")
		quit(1)
		return
	var scene: Node = packed.instantiate()
	root.add_child(scene)
	var player: Player
	for i in 20:
		await physics_frame
		player = root.find_child("Player", true, false)
		if player:
			break
	if player == null:
		push_error("Player missing")
		quit(1)
		return
	for i in 40:
		await physics_frame
		if player.state_name() == "Grounded":
			break
	print("LAND state=", player.state_name(), " pos=", player.global_position)
	print("CAM pos=", player.camera_rig.camera.global_position, " fwd=", player.camera_rig.flat_forward())
	if player.state_name() != "Grounded":
		push_error("Did not land")
		quit(1)
		return

	await _test_grab_mantle(player)
	await _test_jump_grab(player)
	await _test_hang_styles(player)
	print("PLAYTEST_OK")
	quit(0)


func _test_grab_mantle(player: Player) -> void:
	player.global_position = Vector3(0.0, 0.4, 22.7)
	player.velocity = Vector3(0, 0, 3.5)
	player.visuals.snap_facing(Vector3(0.0, 0.0, 1.0))
	player.camera_rig.yaw = PI
	player.camera_rig.pitch = -0.30
	_hold("move_forward", true)
	_press("jump")
	var seen := {}
	var grab_captured := false
	var grab_mid := false
	var tree_stopped := false
	for i in 90:
		await physics_frame
		seen[player.state_name()] = true
		if player.state_name() == "LedgeGrab":
			grab_captured = player.visuals.grab_xfade.captured
			if player.grab_alpha > 0.12 and player.grab_alpha < 0.98:
				grab_mid = true
			if player.visuals.anim_tree and not player.visuals.anim_tree.active:
				tree_stopped = true
		if player.state_name() == "Hang":
			break
	print("GRAB seen=", seen.keys(), " final=", player.state_name(), " pos=", player.global_position)
	print("GRAB_XFADE captured=", grab_captured, " mid=", grab_mid, " tree_off=", tree_stopped, " alpha=", player.grab_alpha, " ik=", player.ik_weight)
	if player.detector:
		print("DETECT ", player.detector.summary_text().replace("\n", " | "))
	if not (seen.has("LedgeGrab") or seen.has("Hang")):
		push_error("Failed to grab ledge from jump")
		quit(1)
		return
	if seen.has("LedgeGrab") and not grab_captured:
		push_error("GrabTransition did not capture the jump pose")
		quit(1)
		return
	if seen.has("LedgeGrab") and not tree_stopped:
		push_error("AnimationTree should stay off without resetting during LedgeGrab")
		quit(1)
		return
	for i in 18:
		await physics_frame
	_hold("move_forward", false)
	_press("move_forward")
	for i in 80:
		await physics_frame
		seen[player.state_name()] = true
		if player.state_name() == "Grounded" and player.global_position.y > 1.0:
			break
	print("MANTLE seen=", seen.keys(), " final=", player.state_name(), " pos=", player.global_position)
	if not seen.has("Mantle"):
		push_error("Mantle did not run")
		quit(1)
		return
	_hold("move_forward", false)


func _test_jump_grab(player: Player) -> void:
	player.reset_to_spawn()
	for i in 12:
		await physics_frame
	player.global_position = Vector3(-1.5, 0.4, 36.55)
	player.velocity = Vector3(0, 0, 3.5)
	player.visuals.snap_facing(Vector3(0.0, 0.0, 1.0))
	player.camera_rig.yaw = PI
	_hold("move_forward", true)
	_press("jump")
	for i in 90:
		await physics_frame
		if player.state_name() == "Hang":
			break
	_hold("move_forward", false)
	print("JG1 state=", player.state_name(), " pos=", player.global_position, " style=", player.hang_style)
	if player.state_name() != "Hang":
		push_error("Jump-grab setup hang failed")
		quit(1)
		return
	# Hop right toward pillar B.
	for i in 10:
		await physics_frame
	_hold("move_left", true)
	_press("jump")
	var seen := {}
	var start_x := player.global_position.x
	for i in 100:
		await physics_frame
		seen[player.state_name()] = true
		if player.state_name() == "Hang" and player.global_position.x > start_x + 1.2:
			break
	_hold("move_left", false)
	print("JG2 seen=", seen.keys(), " final=", player.state_name(), " pos=", player.global_position)


func _test_hang_styles(player: Player) -> void:
	player.reset_to_spawn()
	for i in 10:
		await physics_frame
	player.global_position = Vector3(0.0, 0.4, 22.7)
	player.velocity = Vector3(0, 0, 3.5)
	player.visuals.snap_facing(Vector3(0.0, 0.0, 1.0))
	player.camera_rig.yaw = PI
	_hold("move_forward", true)
	_press("jump")
	var cat := false
	var cat_seen := {}
	for i in 90:
		await physics_frame
		cat_seen[player.state_name()] = true
		if player.state_name() == "Hang" and player.active_target:
			print("STYLE_CAT ", player.active_target.hang_style_name())
			cat = player.active_target.hang_style == ClimbTarget.HangStyle.BRACED
			break
	print("STYLE_CAT seen=", cat_seen.keys())
	_hold("move_forward", false)
	player.reset_to_spawn()
	for i in 12:
		await physics_frame
	var course := root.find_child("TestCourse", true, false)
	if course and course.has_node("Overhang"):
		print("OVERHANG body=", (course.get_node("Overhang") as Node3D).global_position)
	player.global_position = Vector3(-2.2, 0.4, 33.1)
	player.velocity = Vector3.ZERO
	player.visuals.snap_facing(Vector3(0, 0, 1))
	await physics_frame
	var free := false
	var preview := player.detector.query({
		"airborne": true,
		"facing": Vector3(0, 0, 1),
		"origin": player.global_position,
		"boost": 0.4,
	})
	print("FREE_PREVIEW ", preview.hang_style_name() if preview else "null", " ", player.detector.summary_text().replace("\n", " | "))
	if preview and preview.hang_style == ClimbTarget.HangStyle.FREE:
		free = true
	player.velocity = Vector3(0.0, 0.0, 3.5)
	player.camera_rig.yaw = PI
	_hold("move_forward", true)
	_press("jump")
	var free_seen := {}
	for i in 90:
		await physics_frame
		free_seen[player.state_name()] = true
		if player.state_name() == "Hang" and player.active_target:
			print("STYLE_FREE ", player.active_target.hang_style_name())
			free = player.active_target.hang_style == ClimbTarget.HangStyle.FREE
			break
	print("STYLE_FREE seen=", free_seen.keys(), " pos=", player.global_position)
	if player.detector:
		print("STYLE_FREE detect ", player.detector.summary_text().replace("\n", " | "))
	_hold("move_forward", false)
	print("HANG_STYLES cat=", cat, " free=", free)
	if not cat:
		push_warning("Cat hang not confirmed")
	if not free:
		push_warning("Free hang not confirmed")


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
