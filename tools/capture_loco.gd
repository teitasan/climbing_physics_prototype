extends SceneTree

## TPS locomotion stills. Usage: godot --path . --resolution 1280x720 -s res://tools/capture_loco.gd


const OUT_DIR := "res://tmp/pose_shots"
const TAG := "ual"


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	root.size = Vector2i(1280, 720)
	DisplayServer.window_set_size(Vector2i(1280, 720))
	var out_abs := ProjectSettings.globalize_path(OUT_DIR)
	DirAccess.make_dir_recursive_absolute(out_abs)
	root.add_child((load("res://scenes/main.tscn") as PackedScene).instantiate())
	var player: Player
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
	for i in 50:
		await physics_frame
		if player.visuals.anim_tree and str(player.visuals.anim_tree.playback.get_current_node()) == "Locomotion":
			break
	var skel: Skeleton3D = player.visuals.skeleton
	var hips := skel.find_bone("Hips")
	var foot := skel.find_bone("LeftFoot")
	print("MODEL ", player.visuals.model_source_name())
	print("FOOT_Y ", (skel.global_transform * skel.get_bone_global_pose(foot)).origin.y, " HIPS_Y ", (skel.global_transform * skel.get_bone_global_pose(hips)).origin.y)
	await _shot(player, out_abs, "tps_idle")
	Input.action_press("move_forward")
	for i in 36:
		await physics_frame
	print("WALK node=", player.visuals.anim_tree.playback.get_current_node(), " blend=", player.visuals.anim_tree.get("parameters/Locomotion/blend_position"))
	await _shot(player, out_abs, "tps_walk")
	Input.action_press("dash")
	for i in 28:
		await physics_frame
	print("SPRINT blend=", player.visuals.anim_tree.get("parameters/Locomotion/blend_position"))
	await _shot(player, out_abs, "tps_sprint")
	Input.action_release("dash")
	Input.action_release("move_forward")
	Input.action_press("jump")
	for i in 8:
		await physics_frame
	Input.action_release("jump")
	print("JUMP state=", player.state_name(), " node=", player.visuals.anim_tree.playback.get_current_node())
	await _shot(player, out_abs, "tps_jump")
	print("CAPTURE_LOCO_OK")
	quit(0)


func _shot(player: Player, out_abs: String, label: String) -> void:
	if player.camera_rig and player.camera_rig.camera:
		player.camera_rig.camera.current = true
	for i in 6:
		await process_frame
	await RenderingServer.frame_post_draw
	await process_frame
	await RenderingServer.frame_post_draw
	var path := "%s/%s_%s.png" % [out_abs, TAG, label]
	var img := root.get_texture().get_image()
	if img == null:
		push_error("no image " + label)
		return
	img.save_png(path)
	print("WROTE ", path)
