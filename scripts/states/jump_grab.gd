class_name JumpGrabState
extends State

var from_target: ClimbTarget


func enter(_prev: String, data: Dictionary = {}) -> void:
	from_target = data.get("from", player.last_hang_target)
	player.jump_grab_until = player.time_now + GameFeel.JUMP_GRAB_WINDOW_S


func physics_update(delta: float) -> void:
	player.apply_gravity(delta)
	player.move_air(delta)
	var facing := player.intent_flat()
	if facing.length_squared() < 0.04 and player.velocity.length_squared() > 0.2:
		facing = Vector3(player.velocity.x, 0.0, player.velocity.z).normalized()
	var t := player.detector.query_jump(player.global_position, facing)
	if t and t.valid and not _is_same_ledge(from_target, t):
		player.active_target = t
		player.hang_style = t.hang_style
		machine.change("LedgeGrab", {"target": t})
		return
	if player.is_on_floor():
		machine.change("Grounded")
		return
	if player.time_now > player.jump_grab_until + 0.55:
		machine.change("Falling")


func _is_same_ledge(from_t: ClimbTarget, t: ClimbTarget) -> bool:
	if from_t == null or t == null:
		return false
	if t.ledge_point.distance_to(from_t.ledge_point) < GameFeel.JUMP_GRAB_MIN_SEPARATION_M:
		return true
	var n := from_t.wall_normal
	if absf(n.dot(t.wall_normal)) > 0.92:
		var planar := t.ledge_point - from_t.ledge_point
		planar -= n * n.dot(planar)
		if planar.length() < 2.2 and absf(n.dot(t.ledge_point - from_t.ledge_point)) < 0.35:
			return true
	return false
