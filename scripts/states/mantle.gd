class_name MantleState
extends State

var target: ClimbTarget
var start := Vector3.ZERO
var mid := Vector3.ZERO
var finish := Vector3.ZERO
var t := 0.0
var duration := GameFeel.MANTLE_DURATION


func enter(_prev: String, data: Dictionary = {}) -> void:
	target = data.get("target", player.active_target)
	t = 0.0
	player.velocity = Vector3.ZERO
	start = player.global_position
	if target:
		var stand := target.stand_position
		# Nudge stand so the capsule sits on top.
		finish = stand
		mid = target.ledge_point + Vector3.UP * 0.42 + target.wall_normal * 0.12
		player.visuals.snap_facing(target.facing_dir())
	else:
		finish = start + Vector3.UP * 1.2
		mid = start + Vector3.UP * 0.7
	player.ik_weight = 0.0
	var col := player.get_node_or_null("CollisionShape3D") as CollisionShape3D
	if col:
		col.disabled = true


func physics_update(delta: float) -> void:
	t += delta
	var a := clampf(t / duration, 0.0, 1.0)
	var s := a * a * (3.0 - 2.0 * a)
	var pos: Vector3
	if s < 0.55:
		var u := s / 0.55
		pos = start.lerp(mid, u)
	else:
		var u := (s - 0.55) / 0.45
		pos = mid.lerp(finish, u)
	player.global_position = pos
	player.ik_weight = 0.0
	if a >= 1.0:
		_finish()


func _finish() -> void:
	var col := player.get_node_or_null("CollisionShape3D") as CollisionShape3D
	if col:
		col.disabled = false
	player.global_position = finish
	player.velocity = Vector3.ZERO
	player.active_target = null
	player.ik_weight = 0.0
	machine.change("Grounded")


func exit(_next: String) -> void:
	var col := player.get_node_or_null("CollisionShape3D") as CollisionShape3D
	if col:
		col.disabled = false
