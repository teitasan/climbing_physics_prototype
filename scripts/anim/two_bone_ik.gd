class_name TwoBoneIK
extends RefCounted

## Original two-bone IK (law of cosines). Not copied from GPL projects.


static func apply(
	skel: Skeleton3D,
	root_i: int,
	mid_i: int,
	tip_i: int,
	target_world: Vector3,
	pole_world: Vector3,
	weight: float
) -> void:
	if root_i < 0 or mid_i < 0 or tip_i < 0 or weight <= 0.01:
		return
	var skel_inv := skel.global_transform.affine_inverse()
	var target := skel_inv * target_world
	var pole := skel_inv * pole_world
	var root_g := skel.get_bone_global_pose(root_i)
	var mid_g := skel.get_bone_global_pose(mid_i)
	var tip_g := skel.get_bone_global_pose(tip_i)
	var a := root_g.origin
	var b := mid_g.origin
	var c := tip_g.origin
	var lab := a.distance_to(b)
	var lbc := b.distance_to(c)
	if lab < 0.001 or lbc < 0.001:
		return
	var lat := clampf(a.distance_to(target), 0.04, lab + lbc - 0.012)
	var pole_dir := (pole - a)
	if pole_dir.length_squared() < 0.0001:
		pole_dir = Vector3.BACK
	var to_target := target - a
	if to_target.length_squared() < 0.0001:
		return
	var axis := to_target.normalized().cross(pole_dir.normalized())
	if axis.length_squared() < 0.00001:
		axis = to_target.normalized().cross(Vector3.UP)
		if axis.length_squared() < 0.00001:
			axis = to_target.normalized().cross(Vector3.RIGHT)
	axis = axis.normalized()
	var cos_elbow := clampf((lab * lab + lbc * lbc - lat * lat) / (2.0 * lab * lbc), -1.0, 1.0)
	var elbow_angle := acos(cos_elbow)
	var cos_root := clampf((lab * lab + lat * lat - lbc * lbc) / (2.0 * lab * lat), -1.0, 1.0)
	var root_angle := acos(cos_root)
	var bend_rot := Basis(axis, root_angle)
	var upper_dir := bend_rot * to_target.normalized()
	var new_mid := a + upper_dir * lab
	var lower_dir := (target - new_mid)
	if lower_dir.length_squared() < 0.0001:
		return
	lower_dir = lower_dir.normalized()
	_aim_bone(skel, root_i, upper_dir, weight)
	_aim_bone(skel, mid_i, lower_dir, weight)
	if elbow_angle < 0.0:
		pass


static func _outgoing_dir(skel: Skeleton3D, bone_i: int) -> Vector3:
	for i in skel.get_bone_count():
		if skel.get_bone_parent(i) == bone_i:
			var o := skel.get_bone_rest(i).origin
			if o.length_squared() > 0.0001:
				return o.normalized()
	return Vector3.DOWN


static func _aim_bone(skel: Skeleton3D, bone_i: int, desired_dir_skel: Vector3, weight: float) -> void:
	var parent_i := skel.get_bone_parent(bone_i)
	var parent_g := Transform3D.IDENTITY
	if parent_i >= 0:
		parent_g = skel.get_bone_global_pose(parent_i)
	var rest := skel.get_bone_rest(bone_i)
	var rest_dir := rest.basis * _outgoing_dir(skel, bone_i)
	if rest_dir.length_squared() < 0.0001:
		rest_dir = Vector3.DOWN
	rest_dir = rest_dir.normalized()
	var current_g := parent_g * rest
	var from_dir := (current_g.basis * rest_dir).normalized()
	if from_dir.length_squared() < 0.0001:
		from_dir = Vector3.DOWN
	var to_dir := desired_dir_skel.normalized()
	var align := Quaternion(from_dir, to_dir)
	var desired_g_basis := Basis(align) * current_g.basis
	var desired_local_basis := parent_g.basis.inverse() * desired_g_basis
	var pose_basis := rest.basis.inverse() * desired_local_basis
	var q := pose_basis.get_rotation_quaternion().normalized()
	var mixed := Quaternion.IDENTITY.slerp(q, clampf(weight, 0.0, 1.0))
	var rest_q := rest.basis.get_rotation_quaternion()
	skel.set_bone_pose_rotation(bone_i, rest_q * mixed)
