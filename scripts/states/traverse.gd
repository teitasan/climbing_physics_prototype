class_name TraverseState
extends State

var target: ClimbTarget


func enter(_prev: String, data: Dictionary = {}) -> void:
	target = data.get("target", player.active_target)


func physics_update(delta: float) -> void:
	if target == null:
		machine.change("Falling")
		return
	player.hang_motion_t += delta
	player.ik_weight = GameFeel.HANG_IK_MAX
	if absf(player.input_vec.x) < 0.18:
		machine.change("Hang", {"target": target})
		return
	if Input.is_action_just_pressed("drop"):
		player.lock_regrab(target.ledge_point)
		player.velocity = target.wall_normal * 1.5
		player.ik_weight = 0.0
		machine.change("Falling")
		return
	if Input.is_action_just_pressed("jump"):
		var hang := machine.states.get("Hang") as HangState
		if hang:
			hang.target = target
			hang._from_hang_jump()
		return
	if (player.input_vec.y < -0.45) and target.can_mantle:
		machine.change("Mantle", {"target": target})
		return
	var next := player.detector.query_along_ledge(target, player.input_vec.x, GameFeel.TRAVERSE_SPEED * delta + 0.18)
	if next == null or not next.valid:
		# Hold position at the end of the ledge.
		player.hang_to(target, 1.0)
		return
	target = next
	player.active_target = target
	player.hang_style = target.hang_style
	var dest := target.hang_pelvis
	player.global_position = player.global_position.move_toward(dest, GameFeel.TRAVERSE_SPEED * delta)
	player.velocity = Vector3.ZERO
	player.visuals.snap_facing(target.facing_dir())
	player.ik_weight = GameFeel.HANG_IK_MAX
