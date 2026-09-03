class_name TraverseStep
extends RefCounted

## One ledge step as a limb sequence, not a whole-body slide.

enum Phase {
	NONE,
	LEAD_HAND,
	PELVIS,
	LEAD_FOOT,
	TRAIL_HAND,
	TRAIL_FOOT,
}

var active := false
var phase: int = Phase.NONE
var t := 0.0
var going_left := true
var from_target: ClimbTarget
var to_target: ClimbTarget
var from_pelvis := Vector3.ZERO
var from_yaw := 0.0
var from_lh := Vector3.ZERO
var from_rh := Vector3.ZERO
var from_lf := Vector3.ZERO
var from_rf := Vector3.ZERO
var to_lh := Vector3.ZERO
var to_rh := Vector3.ZERO
var to_lf := Vector3.ZERO
var to_rf := Vector3.ZERO


func clear() -> void:
	active = false
	phase = Phase.NONE
	t = 0.0
	from_target = null
	to_target = null


func begin(player: Player, from: ClimbTarget, to: ClimbTarget, left: bool) -> bool:
	clear()
	if player == null or from == null or to == null:
		return false
	going_left = left
	from_target = from
	to_target = to
	from_pelvis = player.global_position
	from_yaw = player.visuals.facing_yaw
	if not player.contacts_ready:
		player.seed_contacts(from)
	from_lh = player.contact_lh
	from_rh = player.contact_rh
	from_lf = player.contact_lf
	from_rf = player.contact_rf
	var delta := to.hang_pelvis - from.hang_pelvis
	to_lh = from_lh + delta
	to_rh = from_rh + delta
	to_lf = from_lf + delta
	to_rf = from_rf + delta
	phase = Phase.LEAD_HAND
	active = true
	player.traverse_side = -1.0 if left else 1.0
	player.traverse_phase = phase_name()
	player.active_target = from
	player.hang_style = to.hang_style
	player.ik_foot_l = 0.0
	player.ik_foot_r = 0.0
	return true


func tick(player: Player, delta: float) -> bool:
	if not active or player == null:
		return false
	t += delta
	var dur := _duration()
	var a := clampf(t / maxf(dur, 0.001), 0.0, 1.0)
	a = a * a * (3.0 - 2.0 * a)
	_apply(player, a)
	if t < dur:
		return true
	_apply(player, 1.0)
	phase = _next_phase()
	t = 0.0
	if phase == Phase.NONE:
		active = false
		player.traverse_phase = ""
		player.active_target = to_target
		return false
	player.traverse_phase = phase_name()
	return true


func phase_name() -> String:
	match phase:
		Phase.LEAD_HAND:
			return "lead_hand"
		Phase.PELVIS:
			return "pelvis"
		Phase.LEAD_FOOT:
			return "lead_foot"
		Phase.TRAIL_HAND:
			return "trail_hand"
		Phase.TRAIL_FOOT:
			return "trail_foot"
		Phase.NONE:
			return ""
		_:
			return ""


func _duration() -> float:
	match phase:
		Phase.LEAD_HAND, Phase.TRAIL_HAND:
			return GameFeel.TRAVERSE_HAND_S
		Phase.PELVIS:
			return GameFeel.TRAVERSE_PELVIS_S
		Phase.LEAD_FOOT, Phase.TRAIL_FOOT:
			return GameFeel.TRAVERSE_FOOT_S
		Phase.NONE:
			return 0.0
		_:
			return 0.0


func _next_phase() -> int:
	match phase:
		Phase.LEAD_HAND:
			return Phase.PELVIS
		Phase.PELVIS:
			return Phase.LEAD_FOOT
		Phase.LEAD_FOOT:
			return Phase.TRAIL_HAND
		Phase.TRAIL_HAND:
			return Phase.TRAIL_FOOT
		Phase.TRAIL_FOOT, Phase.NONE:
			return Phase.NONE
		_:
			return Phase.NONE


func _apply(player: Player, a: float) -> void:
	var wall_n := from_target.wall_normal if from_target else Vector3.FORWARD
	var lead_hand := Limb.Id.LEFT_HAND if going_left else Limb.Id.RIGHT_HAND
	var trail_hand := Limb.Id.RIGHT_HAND if going_left else Limb.Id.LEFT_HAND
	var lead_foot := Limb.Id.LEFT_FOOT if going_left else Limb.Id.RIGHT_FOOT
	var trail_foot := Limb.Id.RIGHT_FOOT if going_left else Limb.Id.LEFT_FOOT
	match phase:
		Phase.LEAD_HAND:
			player.active_target = from_target
			player.set_contact(lead_hand, _arc(_from_limb(lead_hand), _to_limb(lead_hand), a, wall_n))
		Phase.PELVIS:
			player.active_target = to_target
			player.global_position = from_pelvis.lerp(to_target.hang_pelvis, a)
			var face := player.visuals.yaw_for_dir(to_target.facing_dir())
			player.visuals.facing_yaw = lerp_angle(from_yaw, face, a)
			player.visuals.rotation.y = player.visuals.facing_yaw
		Phase.LEAD_FOOT:
			player.set_contact(lead_foot, _arc(_from_limb(lead_foot), _to_limb(lead_foot), a, wall_n))
		Phase.TRAIL_HAND:
			player.set_contact(trail_hand, _arc(_from_limb(trail_hand), _to_limb(trail_hand), a, wall_n))
		Phase.TRAIL_FOOT:
			player.set_contact(trail_foot, _arc(_from_limb(trail_foot), _to_limb(trail_foot), a, wall_n))
		Phase.NONE:
			pass
		_:
			pass
	player.velocity = Vector3.ZERO
	player.ik_foot_l = 0.0
	player.ik_foot_r = 0.0


func _from_limb(limb_id: int) -> Vector3:
	match limb_id:
		Limb.Id.LEFT_HAND:
			return from_lh
		Limb.Id.RIGHT_HAND:
			return from_rh
		Limb.Id.LEFT_FOOT:
			return from_lf
		Limb.Id.RIGHT_FOOT:
			return from_rf
		_:
			return Vector3.ZERO


func _to_limb(limb_id: int) -> Vector3:
	match limb_id:
		Limb.Id.LEFT_HAND:
			return to_lh
		Limb.Id.RIGHT_HAND:
			return to_rh
		Limb.Id.LEFT_FOOT:
			return to_lf
		Limb.Id.RIGHT_FOOT:
			return to_rf
		_:
			return Vector3.ZERO


func _arc(from: Vector3, to: Vector3, a: float, wall_n: Vector3) -> Vector3:
	var p := from.lerp(to, a)
	var lift := sin(a * PI) * 0.035
	return p + Vector3.UP * lift + wall_n * lift * 0.25
