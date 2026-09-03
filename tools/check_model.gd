extends SceneTree


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	var packed := load("res://scenes/main.tscn")
	root.add_child(packed.instantiate())
	await physics_frame
	await physics_frame
	var player: Player = root.find_child("Player", true, false)
	if player == null:
		push_error("no player")
		quit(1)
		return
	var v: PlayerVisuals = player.visuals
	print("MODEL ", v.model_source_name(), " imported=", v.using_imported)
	if v.skeleton:
		print("BONES ", v.skeleton.get_bone_count(), " hips=", v.skeleton.find_bone("pelvis"), " head=", v.skeleton.find_bone("Head"), " larm=", v.skeleton.find_bone("upperarm_l"))
	else:
		push_error("no skeleton")
		quit(1)
		return
	player.visuals.snap_facing(player.camera_rig.flat_forward())
	await physics_frame
	var fwd: Vector3 = player.camera_rig.flat_forward()
	var right: Vector3 = player.camera_rig.flat_right()
	var to_cam := player.camera_rig.camera.global_position - player.global_position
	to_cam.y = 0.0
	var behind_dot := player.visuals.facing_dir().dot(to_cam.normalized())
	print("CAM_RIGHT ", right, " FWD ", fwd)
	print("FACE_DIR ", player.visuals.facing_dir(), " YAW ", player.visuals.facing_yaw)
	print("TPS_BEHIND_DOT ", behind_dot, " CAM ", player.camera_rig.camera.global_position)
	var yaw := wrapf(player.visuals.facing_yaw, -PI, PI)
	if absf(yaw) > 0.45:
		push_error("spawn facing yaw should be ~0 so the mesh faces down the course, not the camera")
		quit(1)
		return
	if fwd.z < 0.5:
		push_error("camera should look down +Z course at spawn")
		quit(1)
		return
	if behind_dot > -0.15:
		push_error("camera should sit behind the character")
		quit(1)
		return
	quit(0)
