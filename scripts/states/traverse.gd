class_name TraverseState
extends State

const StepScript := preload("res://scripts/anim/traverse_step.gd")

var target: ClimbTarget
var _step = StepScript.new()
var _hang_after_step := false


func enter(_prev: String, data: Dictionary = {}) -> void:
	target = data.get("target", player.active_target)
	_step.clear()
	_hang_after_step = false
	player.ik_foot_l = 0.0
	player.ik_foot_r = 0.0
	player.traverse_phase = ""
	player.traverse_side = 0.0
	if target:
		player.seed_contacts(target)
		player.ik_weight = GameFeel.HANG_IK_MAX


func exit(_next: String) -> void:
	_step.clear()
	player.ik_foot_l = 0.0
	player.ik_foot_r = 0.0
	player.traverse_phase = ""
	player.traverse_side = 0.0


func physics_update(delta: float) -> void:
	if target == null:
		machine.change("Falling")
		return
	player.hang_motion_t += delta
	player.ik_weight = GameFeel.HANG_IK_MAX
	if Input.is_action_just_pressed("drop"):
		player.lock_regrab(target.ledge_point)
		player.velocity = target.wall_normal * 1.5
		player.ik_weight = 0.0
		player.contacts_ready = false
		machine.change("Falling")
		return
	if Input.is_action_just_pressed("jump"):
		var hang := machine.states.get("Hang") as HangState
		if hang:
			hang.target = target
			hang._from_hang_jump()
		return
	if _step.active:
		if absf(player.input_vec.x) < 0.18:
			_hang_after_step = true
		if _step.tick(player, delta):
			return
		target = _step.to_target
		player.active_target = target
		player.hang_style = target.hang_style
		player.seed_contacts(target)
		_step.clear()
		if _hang_after_step or absf(player.input_vec.x) < 0.18:
			machine.change("Hang", {"target": target})
			return
	if (player.input_vec.y < -0.45) and target.can_mantle:
		machine.change("Mantle", {"target": target})
		return
	if absf(player.input_vec.x) < 0.18:
		machine.change("Hang", {"target": target})
		return
	var side := player.hang_strafe_sign()
	if absf(side) < 0.5:
		player.hang_to(target, 1.0)
		player.seed_contacts(target)
		return
	var next := player.detector.query_along_ledge(target, side, GameFeel.TRAVERSE_STEP_M)
	if next == null or not next.valid or not _usable_step(target, next, side):
		player.hang_to(target, 1.0)
		player.seed_contacts(target)
		return
	if not _step.begin(player, target, next, side < 0.0):
		player.hang_to(target, 1.0)
		return
	_hang_after_step = false
	target = next


func _usable_step(from: ClimbTarget, to: ClimbTarget, side: float) -> bool:
	var along := to.ledge_point - from.ledge_point
	var d := from.along_right().dot(along) * signf(side)
	if d < 0.10 or d > 0.70:
		return false
	if absf(to.ledge_point.y - from.ledge_point.y) > 0.45:
		return false
	return true
