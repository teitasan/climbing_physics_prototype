class_name GrabTransition
extends RefCounted

## Captures the live skeleton (usually JumpLoop) and interpolates to a hang pose.
## Does not reset bones when the AnimationTree is stopped.

var captured := false
var from_rot: Array[Quaternion] = []
var to_rot: Array[Quaternion] = []
var from_pos: Array[Vector3] = []
var to_pos: Array[Vector3] = []


func clear() -> void:
	captured = false
	from_rot.clear()
	to_rot.clear()
	from_pos.clear()
	to_pos.clear()


func begin(skel: Skeleton3D, stop_tree: Callable, pose_hang_base: Callable) -> void:
	clear()
	if skel == null:
		return
	skel.force_update_all_bone_transforms()
	_store(skel, from_rot, from_pos)
	if stop_tree.is_valid():
		stop_tree.call()
	if pose_hang_base.is_valid():
		pose_hang_base.call()
	skel.force_update_all_bone_transforms()
	_store(skel, to_rot, to_pos)
	_restore(skel, from_rot, from_pos)
	captured = from_rot.size() == skel.get_bone_count() and not from_rot.is_empty()


func apply(skel: Skeleton3D, alpha: float) -> void:
	if skel == null or not captured:
		return
	var a := clampf(alpha, 0.0, 1.0)
	var n := mini(skel.get_bone_count(), from_rot.size())
	n = mini(n, to_rot.size())
	for i in n:
		skel.set_bone_pose_rotation(i, from_rot[i].slerp(to_rot[i], a))
		skel.set_bone_pose_position(i, from_pos[i].lerp(to_pos[i], a))


func _store(skel: Skeleton3D, rots: Array[Quaternion], poss: Array[Vector3]) -> void:
	rots.clear()
	poss.clear()
	for i in skel.get_bone_count():
		rots.append(skel.get_bone_pose_rotation(i))
		poss.append(skel.get_bone_pose_position(i))


func _restore(skel: Skeleton3D, rots: Array[Quaternion], poss: Array[Vector3]) -> void:
	var n := mini(skel.get_bone_count(), rots.size())
	for i in n:
		skel.set_bone_pose_rotation(i, rots[i])
		skel.set_bone_pose_position(i, poss[i])
