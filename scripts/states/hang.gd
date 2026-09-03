class_name HangState
extends State

var target: ClimbTarget
var _refresh_cd := 0.0
var hang_elapsed := 0.0


func enter(_prev: String, data: Dictionary = {}) -> void:
	target = data.get("target", player.active_target)
	player.velocity = Vector3.ZERO
	_refresh_cd = 0.0
	hang_elapsed = 0.0
	if target:
		player.hang_to(target, 1.0)


func physics_update(delta: float) -> void:
	if target == null:
		machine.change("Falling")
		return
	hang_elapsed += delta
	_refresh_cd -= delta
	if _refresh_cd <= 0.0:
		_refresh_cd = 0.12
		var refreshed := player.detector.query({
			"origin": player.global_position,
			"facing": target.facing_dir(),
			"airborne": true,
			"boost": 0.12,
		})
		if refreshed and refreshed.valid and refreshed.ledge_point.distance_to(target.ledge_point) < 0.85:
			target = refreshed
			player.active_target = target
			player.hang_style = target.hang_style
	player.hang_to(target, clampf(delta * 14.0, 0.0, 1.0))
	if Input.is_action_just_pressed("drop") or (Input.is_action_just_pressed("move_back") and absf(player.input_vec.x) < 0.2):
		_drop()
		return
	if Input.is_action_just_pressed("jump"):
		_from_hang_jump()
		return
	var climb_up := Input.is_action_just_pressed("move_forward") or (player.input_vec.y < -0.55 and hang_elapsed > 0.22)
	if climb_up and target.can_mantle:
		machine.change("Mantle", {"target": target})
		return
	if absf(player.input_vec.x) > 0.25:
		machine.change("Traverse", {"target": target})
		return


func _drop() -> void:
	player.lock_regrab(target.ledge_point if target else player.global_position)
	var push := Vector3.ZERO
	if target:
		push = target.wall_normal * 1.6
	player.velocity = push + Vector3.DOWN * 0.4
	player.ik_weight = 0.0
	player.active_target = null
	machine.change("Falling")


func _from_hang_jump() -> void:
	var dir := player.intent_flat()
	var n := target.wall_normal if target else Vector3.BACK
	var backing := player.input_vec.y > 0.3
	var up_intent := player.input_vec.y < -0.2
	var vel := Vector3.UP * (5.8 if up_intent else 5.15)
	vel += n * (2.6 if backing else 0.55)
	if dir.length_squared() > 0.04:
		vel += dir.normalized() * 6.3
	player.velocity = vel
	player.jump_grab_until = player.time_now + GameFeel.JUMP_GRAB_WINDOW_S
	player.lock_regrab(target.ledge_point if target else player.global_position, 0.38)
	player.ik_weight = 0.15
	machine.change("JumpGrab", {"from": target})
