class_name ClimbTarget
extends RefCounted

enum HangStyle {
	BRACED,
	FREE,
}

var valid := false
var fail_reason := ""
var ledge_point := Vector3.ZERO
var wall_normal := Vector3.FORWARD
var top_normal := Vector3.UP
var hang_style: HangStyle = HangStyle.BRACED
var can_mantle := false
var can_stand := false
var can_traverse := true
var collider: Object
var score := 0.0
var reach_units := 0.0
var ledge_height_from_feet := 0.0
var hand_left := Vector3.ZERO
var hand_right := Vector3.ZERO
var foot_left := Vector3.ZERO
var foot_right := Vector3.ZERO
var stand_position := Vector3.ZERO
var hang_pelvis := Vector3.ZERO
var debug_notes: PackedStringArray = PackedStringArray()


func hang_style_name() -> String:
	match hang_style:
		HangStyle.BRACED:
			return "Cat/Braced Hang"
		HangStyle.FREE:
			return "Free Hang"
		_:
			return "Hang"


func tangent() -> Vector3:
	var t := Vector3.UP.cross(wall_normal)
	if t.length_squared() < 0.0001:
		t = Vector3.RIGHT
	return t.normalized()


func facing_dir() -> Vector3:
	return (-wall_normal).normalized()


func limb_target(limb_id: int) -> Vector3:
	match limb_id:
		Limb.Id.LEFT_HAND:
			return hand_left
		Limb.Id.RIGHT_HAND:
			return hand_right
		Limb.Id.LEFT_FOOT:
			return foot_left
		Limb.Id.RIGHT_FOOT:
			return foot_right
		_:
			return ledge_point
