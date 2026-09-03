class_name Limb
extends RefCounted

enum Id {
	LEFT_HAND,
	RIGHT_HAND,
	LEFT_FOOT,
	RIGHT_FOOT,
}

const ALL: Array[int] = [
	Id.LEFT_HAND,
	Id.RIGHT_HAND,
	Id.LEFT_FOOT,
	Id.RIGHT_FOOT,
]


static func is_hand(id: int) -> bool:
	return id == Id.LEFT_HAND or id == Id.RIGHT_HAND


static func is_left(id: int) -> bool:
	return id == Id.LEFT_HAND or id == Id.LEFT_FOOT


static func display_name(id: int) -> String:
	match id:
		Id.LEFT_HAND:
			return "LeftHand"
		Id.RIGHT_HAND:
			return "RightHand"
		Id.LEFT_FOOT:
			return "LeftFoot"
		Id.RIGHT_FOOT:
			return "RightFoot"
		_:
			return "Unknown"
