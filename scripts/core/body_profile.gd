class_name BodyProfile
extends RefCounted

## Regular Male-ish proportions. Swap later per character.
var height_m := 1.75
var arm_length_m := 0.72
var leg_length_m := 0.92
var shoulder_width_m := 0.40
var hip_width_m := 0.28
var shoulder_height_m := 1.46
var hip_height_m := 0.94
var hand_span_m := 0.18


func max_hand_reach_m() -> float:
	return arm_length_m


func max_foot_reach_m() -> float:
	return leg_length_m * 0.55


func max_hand_reach_units() -> float:
	return ReachUnits.meters_to_units(max_hand_reach_m())


func max_foot_reach_units() -> float:
	return ReachUnits.meters_to_units(max_foot_reach_m())


func socket_offset(limb_id: int) -> Vector3:
	var half_shoulders := shoulder_width_m * 0.5
	var half_hips := hip_width_m * 0.5
	match limb_id:
		Limb.Id.LEFT_HAND:
			return Vector3(-half_shoulders, shoulder_height_m, 0.0)
		Limb.Id.RIGHT_HAND:
			return Vector3(half_shoulders, shoulder_height_m, 0.0)
		Limb.Id.LEFT_FOOT:
			return Vector3(-half_hips, hip_height_m, 0.0)
		Limb.Id.RIGHT_FOOT:
			return Vector3(half_hips, hip_height_m, 0.0)
		_:
			return Vector3(0.0, hip_height_m, 0.0)
