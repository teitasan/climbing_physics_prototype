class_name ReachQuery
extends RefCounted

## Isolated reach test. Replace the body of can_reach() with 25cm-grid
## discrete checks later without touching climb detection.

var profile: BodyProfile = BodyProfile.new()


func can_reach(socket_world: Vector3, target_world: Vector3, limb_id: int, forgive_m: float) -> bool:
	return distance_m(socket_world, target_world) <= max_reach_m(limb_id) + forgive_m


func distance_m(a: Vector3, b: Vector3) -> float:
	return a.distance_to(b)


func distance_units(a: Vector3, b: Vector3) -> float:
	return ReachUnits.meters_to_units(distance_m(a, b))


func max_reach_m(limb_id: int) -> float:
	if Limb.is_hand(limb_id):
		return profile.max_hand_reach_m()
	return profile.max_foot_reach_m()


func report(socket_world: Vector3, target_world: Vector3, limb_id: int, forgive_m: float) -> Dictionary:
	var dist := distance_m(socket_world, target_world)
	var max_d := max_reach_m(limb_id) + forgive_m
	return {
		"limb": Limb.display_name(limb_id),
		"distance_m": dist,
		"distance_units": ReachUnits.meters_to_units(dist),
		"max_m": max_d,
		"max_units": ReachUnits.meters_to_units(max_d),
		"ok": dist <= max_d,
	}
