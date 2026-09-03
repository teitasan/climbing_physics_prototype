extends SceneTree


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	var packed := load("res://scenes/main.tscn")
	root.add_child(packed.instantiate())
	var player: Player
	for i in 40:
		await physics_frame
		player = root.find_child("Player", true, false)
		if player and player.visuals:
			break
	if player == null:
		push_error("no player")
		quit(1)
		return
	var v: PlayerVisuals = player.visuals
	print("MODEL ", v.model_source_name())
	if v.anim_tree == null or not v.anim_tree.using_tree:
		push_error("AnimationTree was not connected")
		quit(1)
		return
	var ap := v.anim_tree.ap
	print("CLIPS Idle=", ap.has_animation("Idle"), " Walk=", ap.has_animation("Walk"), " Jog=", ap.has_animation("Jog_Fwd"), " Sprint=", ap.has_animation("Sprint"), " JumpStart=", ap.has_animation("Jump_Start"), " Jump=", ap.has_animation("Jump"), " Land=", ap.has_animation("Jump_Land"))
	if v.skeleton.find_bone("Hips") < 0 or v.skeleton.find_bone("LeftUpperArm") < 0:
		push_error("Humanoid bone names missing after retarget")
		quit(1)
		return
	for i in 20:
		await process_frame
	var playback := v.anim_tree.playback
	print("NODE ", playback.get_current_node(), " blend=", v.anim_tree.get(PlayerAnimTree.PARAM_BLEND), " scale=", v.anim_tree.get(PlayerAnimTree.PARAM_SCALE))
	var idle_hips := v.skeleton.get_bone_pose_rotation(v.skeleton.find_bone("Hips"))
	Input.action_press("move_forward")
	for i in 30:
		await physics_frame
	var walk_speed := Vector3(player.velocity.x, 0, player.velocity.z).length()
	var walk_blend: float = v.anim_tree.get(PlayerAnimTree.PARAM_BLEND)
	var walk_scale: float = v.anim_tree.get(PlayerAnimTree.PARAM_SCALE)
	print("WALK node=", playback.get_current_node(), " speed=", walk_speed, " blend=", walk_blend, " scale=", walk_scale)
	if str(playback.get_current_node()) != "Locomotion":
		push_error("Walk should be on Locomotion, got " + str(playback.get_current_node()))
		quit(1)
		return
	if absf(walk_blend - walk_speed) > 1.25:
		push_error("Locomotion blend_position should track m/s, blend=%s speed=%s" % [walk_blend, walk_speed])
		quit(1)
		return
	Input.action_release("move_forward")
	var walk_hips := v.skeleton.get_bone_pose_rotation(v.skeleton.find_bone("Hips"))
	var hip_delta := idle_hips.angle_to(walk_hips)
	print("HIP_DELTA ", hip_delta)
	if hip_delta < 0.01 and walk_speed > 1.0:
		push_error("Walk clip does not appear to move the hips")
		quit(1)
		return
	Input.action_press("jump")
	for i in 8:
		await physics_frame
	Input.action_release("jump")
	print("JUMP state=", player.state_name(), " node=", playback.get_current_node())
	if str(playback.get_current_node()) != "JumpStart" and str(playback.get_current_node()) != "JumpLoop":
		push_error("Jump should travel into JumpStart/JumpLoop")
		quit(1)
		return
	print("ANIM_OK")
	quit(0)
