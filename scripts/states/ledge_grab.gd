class_name LedgeGrabState
extends State

var _target: ClimbTarget
var _t := 0.0
var _from_pos := Vector3.ZERO
var _from_yaw := 0.0


func enter(_prev: String, data: Dictionary = {}) -> void:
	_target = data.get("target", player.active_target)
	_t = 0.0
	_from_pos = player.global_position
	_from_yaw = player.visuals.facing_yaw
	player.velocity = Vector3.ZERO
	player.ik_weight = 0.0
	player.grab_alpha = 0.0
	player.hang_motion_t = 0.0
	if _target:
		player.active_target = _target
		player.hang_style = _target.hang_style
	# Keep the current AnimationTree pose. Do not reset the skeleton.
	player.visuals.begin_grab()


func physics_update(delta: float) -> void:
	if _target == null:
		machine.change("Falling")
		return
	_t += delta
	var a := clampf(_t / GameFeel.GRAB_DURATION, 0.0, 1.0)
	a = a * a * (3.0 - 2.0 * a)
	player.global_position = _from_pos.lerp(_target.hang_pelvis, a)
	player.velocity = Vector3.ZERO
	var face := player.visuals.yaw_for_dir(_target.facing_dir())
	player.visuals.facing_yaw = lerp_angle(_from_yaw, face, a)
	player.visuals.rotation.y = player.visuals.facing_yaw
	player.active_target = _target
	player.hang_style = _target.hang_style
	player.ik_weight = a * GameFeel.GRAB_IK_MAX
	player.grab_alpha = a
	if a >= 1.0:
		machine.change("Hang", {"target": _target})
