class_name LedgeGrabState
extends State

var _target: ClimbTarget
var _t := 0.0
const DURATION := 0.12


func enter(_prev: String, data: Dictionary = {}) -> void:
	_target = data.get("target", player.active_target)
	_t = 0.0
	player.velocity = Vector3.ZERO
	if _target:
		player.active_target = _target
		player.hang_style = _target.hang_style
		player.ik_weight = 0.0
		player.visuals.snap_facing(_target.facing_dir())


func physics_update(delta: float) -> void:
	if _target == null:
		machine.change("Falling")
		return
	_t += delta
	var a := clampf(_t / DURATION, 0.0, 1.0)
	a = a * a * (3.0 - 2.0 * a)
	player.hang_to(_target, a)
	player.ik_weight = 0.0
	if a >= 1.0:
		machine.change("Hang", {"target": _target})
