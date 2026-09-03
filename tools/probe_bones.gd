extends SceneTree


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	var packed := load("res://scenes/main.tscn")
	root.add_child(packed.instantiate())
	var player: Player
	for i in 20:
		await physics_frame
		player = root.find_child("Player", true, false)
		if player:
			break
	player.visuals.auto_animate = false
	var skel: Skeleton3D = player.visuals.skeleton
	var hand_r := int(player.visuals._bone["RightHand"])
	print("REST R=", skel.get_bone_global_pose(hand_r).origin)
	for extra in [
		Vector3(-1.1, 0.0, 0.4),
		Vector3(-1.1, 0.0, -0.4),
		Vector3(1.1, 0.0, 0.4),
		Vector3(-1.1, 0.0, 0.4),
	]:
		player.visuals.rest_pose()
		player.visuals.apply_test_rot("RightArm", extra)
		print("R ", extra, " -> ", skel.get_bone_global_pose(hand_r).origin)
	print("DONE")
	quit(0)
