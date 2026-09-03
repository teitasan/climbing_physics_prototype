class_name PlayerVisuals
extends Node3D

const GrabXfade := preload("res://scripts/anim/grab_transition.gd")

## Procedural humanoid mannequin with Mixamo/Quaternius-style bone names.
## If a Quaternius GLB is present it is instanced. Locomotion uses the Universal
## Animation Library through AnimationTree when available; hang/mantle stay
## procedural until climb clips exist.

var player: Player
var skeleton: Skeleton3D
var animation_player: AnimationPlayer
var anim_tree: PlayerAnimTree
var grab_xfade := GrabXfade.new()
var using_imported := false
var imported_root: Node3D
var phase := 0.0
var facing_yaw := 0.0
## Quaternius Godot-UE meshes face +Z, not Godot's Vector3.FORWARD (-Z).
const MODEL_FORWARD := Vector3(0.0, 0.0, 1.0)
var auto_animate := true
var _bone: Dictionary = {}
var _ik_poles: Dictionary = {}
var _limb_markers: Dictionary = {}

const BONE_ALIASES := {
	"Hips": ["Hips", "hips", "pelvis", "mixamorig:Hips", "mixamorig_Hips"],
	"Spine": ["Spine", "spine", "spine_01", "mixamorig:Spine", "Spine1"],
	"Chest": ["Chest", "UpperChest", "spine_02", "spine_03", "Spine1", "Spine2", "mixamorig:Spine1", "mixamorig:Spine2"],
	"Neck": ["Neck", "neck", "neck_01", "mixamorig:Neck"],
	"Head": ["Head", "head", "mixamorig:Head"],
	"LeftShoulder": ["LeftShoulder", "clavicle_l", "mixamorig:LeftShoulder"],
	"LeftArm": ["LeftUpperArm", "LeftArm", "upperarm_l", "mixamorig:LeftArm", "upperarm.l"],
	"LeftForeArm": ["LeftLowerArm", "LeftForeArm", "lowerarm_l", "mixamorig:LeftForeArm", "lowerarm.l"],
	"LeftHand": ["LeftHand", "hand_l", "mixamorig:LeftHand", "hand.l"],
	"RightShoulder": ["RightShoulder", "clavicle_r", "mixamorig:RightShoulder"],
	"RightArm": ["RightUpperArm", "RightArm", "upperarm_r", "mixamorig:RightArm", "upperarm.r"],
	"RightForeArm": ["RightLowerArm", "RightForeArm", "lowerarm_r", "mixamorig:RightForeArm", "lowerarm.r"],
	"RightHand": ["RightHand", "hand_r", "mixamorig:RightHand", "hand.r"],
	"LeftUpLeg": ["LeftUpperLeg", "LeftUpLeg", "thigh_l", "mixamorig:LeftUpLeg", "thigh.l"],
	"LeftLeg": ["LeftLowerLeg", "LeftLeg", "calf_l", "mixamorig:LeftLeg", "shin.l"],
	"LeftFoot": ["LeftFoot", "foot_l", "mixamorig:LeftFoot", "foot.l"],
	"RightUpLeg": ["RightUpperLeg", "RightUpLeg", "thigh_r", "mixamorig:RightUpLeg", "thigh.r"],
	"RightLeg": ["RightLowerLeg", "RightLeg", "calf_r", "mixamorig:RightLeg", "shin.r"],
	"RightFoot": ["RightFoot", "foot_r", "mixamorig:RightFoot", "foot.r"],
}

const QUATERNIUS_CANDIDATES: Array[String] = [
	"res://assets/characters/quaternius/Superhero_Male_FullBody.gltf",
	"res://assets/characters/Superhero_Male_FullBody.gltf",
	"res://assets/characters/Regular_Male.glb",
	"res://assets/characters/Regular_Male.gltf",
	"res://assets/characters/quaternius/Regular_Male.glb",
	"res://assets/characters/quaternius/Regular_Female.gltf",
	"res://assets/characters/Regular_Female.glb",
]

const HAIR_CANDIDATES: Array[String] = [
	"res://assets/characters/quaternius/Hair_SimpleParted.gltf",
]
const BROW_CANDIDATES: Array[String] = [
	"res://assets/characters/quaternius/Eyebrows_Regular.gltf",
]


func setup(p: Player) -> void:
	player = p
	if not _try_load_quaternius():
		_build_mannequin()
	_map_bones()
	if using_imported:
		_attach_cosmetics()
		_ground_imported()
	_make_limb_markers()
	_try_setup_anim_tree()


func _try_load_quaternius() -> bool:
	for path in QUATERNIUS_CANDIDATES:
		if not ResourceLoader.exists(path):
			continue
		var packed := load(path)
		if packed == null:
			continue
		var inst: Node = packed.instantiate() if packed is PackedScene else null
		if inst == null:
			continue
		imported_root = inst as Node3D
		if imported_root == null:
			inst.queue_free()
			continue
		add_child(imported_root)
		imported_root.position = Vector3.ZERO
		skeleton = _find_skeleton(imported_root)
		animation_player = _find_anim(imported_root)
		if skeleton:
			using_imported = true
			imported_root.scale = Vector3.ONE
			imported_root.position = Vector3.ZERO
			return true
		imported_root.queue_free()
		imported_root = null
	return false


func _attach_cosmetics() -> void:
	# Origin-at-0 hair verts sit around standing head height (~1.68 m).
	# Parent to Head with a matching negative offset so it follows the skull.
	if imported_root == null or skeleton == null:
		return
	var head_idx := skeleton.find_bone("Head")
	if head_idx < 0:
		_add_packed(imported_root, HAIR_CANDIDATES)
		return
	var att := BoneAttachment3D.new()
	att.name = "HairAttach"
	att.bone_name = "Head"
	att.bone_idx = head_idx
	skeleton.add_child(att)
	_add_packed(att, HAIR_CANDIDATES)
	if att.get_child_count() > 0:
		(att.get_child(0) as Node3D).position = Vector3(0.0, -1.68, 0.0)


func _add_packed(parent: Node, paths: Array[String]) -> void:
	for path in paths:
		if not ResourceLoader.exists(path):
			continue
		var packed := load(path)
		if packed is PackedScene:
			var inst: Node = packed.instantiate()
			parent.add_child(inst)
			return


func _ground_imported() -> void:
	if imported_root == null:
		return
	imported_root.rotation = Vector3.ZERO
	imported_root.position = Vector3.ZERO
	if skeleton == null:
		imported_root.position.y = -0.09
		return
	skeleton.reset_bone_poses()
	skeleton.force_update_all_bone_transforms()
	var foot_y := 999.0
	for bone_name in ["LeftFoot", "RightFoot", "LeftToes", "RightToes", "foot_l", "foot_r"]:
		var idx := skeleton.find_bone(bone_name)
		if idx < 0:
			continue
		foot_y = minf(foot_y, skeleton.get_bone_global_pose(idx).origin.y)
	if foot_y < 100.0:
		imported_root.position.y = -foot_y
	else:
		imported_root.position.y = -0.09


func _estimate_aabb(n: Node) -> AABB:
	var acc := AABB()
	var started := false
	if n is VisualInstance3D:
		acc = (n as VisualInstance3D).get_aabb()
		started = true
	for c in n.get_children():
		var child_aabb := _estimate_aabb(c)
		if child_aabb.size == Vector3.ZERO:
			continue
		if started:
			acc = acc.merge(child_aabb)
		else:
			acc = child_aabb
			started = true
	return acc


func _try_setup_anim_tree() -> void:
	if not using_imported or skeleton == null:
		return
	var tree := PlayerAnimTree.new()
	if tree.setup(player, skeleton, self):
		anim_tree = tree
		animation_player = tree.ap
	else:
		tree.free()


func _find_skeleton(n: Node) -> Skeleton3D:
	if n is Skeleton3D:
		return n
	for c in n.get_children():
		var s := _find_skeleton(c)
		if s:
			return s
	return null


func _find_anim(n: Node) -> AnimationPlayer:
	if n is AnimationPlayer:
		return n
	for c in n.get_children():
		var a := _find_anim(c)
		if a:
			return a
	return null


func _build_mannequin() -> void:
	skeleton = Skeleton3D.new()
	skeleton.name = "Skeleton3D"
	add_child(skeleton)
	_add_bone("Hips", -1, Vector3(0, 0.96, 0), Vector3.ZERO)
	_add_bone("Spine", _i("Hips"), Vector3(0, 0.14, 0.02), Vector3.ZERO)
	_add_bone("Chest", _i("Spine"), Vector3(0, 0.16, 0.01), Vector3.ZERO)
	_add_bone("Neck", _i("Chest"), Vector3(0, 0.17, 0), Vector3.ZERO)
	_add_bone("Head", _i("Neck"), Vector3(0, 0.12, 0.02), Vector3.ZERO)
	_add_bone("LeftShoulder", _i("Chest"), Vector3(-0.13, 0.12, 0), Vector3.ZERO)
	_add_bone("LeftArm", _i("LeftShoulder"), Vector3(-0.14, 0, 0), Vector3.ZERO)
	_add_bone("LeftForeArm", _i("LeftArm"), Vector3(-0.27, 0, 0), Vector3.ZERO)
	_add_bone("LeftHand", _i("LeftForeArm"), Vector3(-0.24, 0, 0), Vector3.ZERO)
	_add_bone("RightShoulder", _i("Chest"), Vector3(0.13, 0.12, 0), Vector3.ZERO)
	_add_bone("RightArm", _i("RightShoulder"), Vector3(0.14, 0, 0), Vector3.ZERO)
	_add_bone("RightForeArm", _i("RightArm"), Vector3(0.27, 0, 0), Vector3.ZERO)
	_add_bone("RightHand", _i("RightForeArm"), Vector3(0.24, 0, 0), Vector3.ZERO)
	_add_bone("LeftUpLeg", _i("Hips"), Vector3(-0.10, -0.06, 0), Vector3.ZERO)
	_add_bone("LeftLeg", _i("LeftUpLeg"), Vector3(0, -0.42, 0), Vector3.ZERO)
	_add_bone("LeftFoot", _i("LeftLeg"), Vector3(0, -0.40, 0.04), Vector3.ZERO)
	_add_bone("RightUpLeg", _i("Hips"), Vector3(0.10, -0.06, 0), Vector3.ZERO)
	_add_bone("RightLeg", _i("RightUpLeg"), Vector3(0, -0.42, 0), Vector3.ZERO)
	_add_bone("RightFoot", _i("RightLeg"), Vector3(0, -0.40, 0.04), Vector3.ZERO)
	_attach_part("Hips", Vector3(0.28, 0.16, 0.16), Color(0.18, 0.32, 0.55), Vector3(0, 0.02, 0))
	_attach_part("Chest", Vector3(0.34, 0.30, 0.18), Color(0.22, 0.45, 0.72), Vector3(0, 0.02, 0))
	_attach_part("Head", Vector3(0.18, 0.20, 0.18), Color(0.90, 0.74, 0.62), Vector3(0, 0.08, 0), true)
	_attach_part("LeftArm", Vector3(0.08, 0.26, 0.08), Color(0.90, 0.74, 0.62), Vector3(-0.13, 0, 0))
	_attach_part("LeftForeArm", Vector3(0.07, 0.24, 0.07), Color(0.90, 0.74, 0.62), Vector3(-0.12, 0, 0))
	_attach_part("RightArm", Vector3(0.08, 0.26, 0.08), Color(0.90, 0.74, 0.62), Vector3(0.13, 0, 0))
	_attach_part("RightForeArm", Vector3(0.07, 0.24, 0.07), Color(0.90, 0.74, 0.62), Vector3(0.12, 0, 0))
	_attach_part("LeftUpLeg", Vector3(0.11, 0.40, 0.11), Color(0.16, 0.18, 0.22), Vector3(0, -0.18, 0))
	_attach_part("LeftLeg", Vector3(0.09, 0.38, 0.09), Color(0.16, 0.18, 0.22), Vector3(0, -0.18, 0))
	_attach_part("RightUpLeg", Vector3(0.11, 0.40, 0.11), Color(0.16, 0.18, 0.22), Vector3(0, -0.18, 0))
	_attach_part("RightLeg", Vector3(0.09, 0.38, 0.09), Color(0.16, 0.18, 0.22), Vector3(0, -0.18, 0))
	_attach_part("LeftFoot", Vector3(0.09, 0.07, 0.18), Color(0.12, 0.10, 0.09), Vector3(0, -0.02, 0.05))
	_attach_part("RightFoot", Vector3(0.09, 0.07, 0.18), Color(0.12, 0.10, 0.09), Vector3(0, -0.02, 0.05))
	# Hair cap
	_attach_part("Head", Vector3(0.19, 0.08, 0.19), Color(0.18, 0.12, 0.09), Vector3(0, 0.16, 0), true)


func _add_bone(bone_name: String, parent: int, origin: Vector3, _euler: Vector3) -> void:
	skeleton.add_bone(bone_name)
	var idx := skeleton.get_bone_count() - 1
	if parent >= 0:
		skeleton.set_bone_parent(idx, parent)
	skeleton.set_bone_rest(idx, Transform3D(Basis.IDENTITY, origin))
	_bone[bone_name] = idx


func _i(bone_name: String) -> int:
	return int(_bone.get(bone_name, -1))


func _attach_part(bone_name: String, size: Vector3, color: Color, offset: Vector3, sphere := false) -> void:
	var att := BoneAttachment3D.new()
	att.bone_name = bone_name
	skeleton.add_child(att)
	var mi := MeshInstance3D.new()
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mat.roughness = 0.55
	mat.metallic = 0.0
	if sphere:
		var sm := SphereMesh.new()
		sm.radius = maxf(size.x, size.y) * 0.5
		sm.height = size.y
		mi.mesh = sm
	else:
		var cm := CapsuleMesh.new()
		if size.y >= size.x:
			cm.radius = minf(size.x, size.z) * 0.5
			cm.height = size.y
		else:
			cm.radius = size.y * 0.5
			cm.height = size.x
			mi.rotation_degrees.z = 90.0
		mi.mesh = cm
	mi.material_override = mat
	mi.position = offset
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	att.add_child(mi)


func _map_bones() -> void:
	if skeleton == null:
		return
	_bone.clear()
	for logical in BONE_ALIASES.keys():
		_bone[logical] = _find_bone_alias(BONE_ALIASES[logical])


func _find_bone_alias(aliases: Array) -> int:
	if skeleton == null:
		return -1
	for a in aliases:
		var idx := skeleton.find_bone(str(a))
		if idx != -1:
			return idx
	for i in skeleton.get_bone_count():
		var n := skeleton.get_bone_name(i).to_lower().replace("mixamorig:", "").replace("mixamorig_", "")
		for a in aliases:
			if n == str(a).to_lower():
				return i
	return -1


func _make_limb_markers() -> void:
	for limb_id in Limb.ALL:
		var mi := MeshInstance3D.new()
		var s := SphereMesh.new()
		s.radius = 0.045
		s.height = 0.09
		mi.mesh = s
		var mat := StandardMaterial3D.new()
		mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		mat.albedo_color = Color(1, 0.85, 0.2, 0.9) if Limb.is_hand(limb_id) else Color(1, 0.45, 0.15, 0.9)
		mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		mi.material_override = mat
		mi.visible = false
		add_child(mi)
		_limb_markers[limb_id] = mi


func facing_dir() -> Vector3:
	return MODEL_FORWARD.rotated(Vector3.UP, facing_yaw)


func yaw_for_dir(dir: Vector3) -> float:
	dir.y = 0.0
	if dir.length_squared() < 0.0002:
		return facing_yaw
	return atan2(dir.x, dir.z)


func set_desired_facing(dir: Vector3, delta: float, speed: float = GameFeel.ROTATE_SPEED) -> void:
	dir.y = 0.0
	if dir.length_squared() < 0.0002:
		return
	facing_yaw = lerp_angle(facing_yaw, yaw_for_dir(dir), clampf(delta * speed, 0.0, 1.0))
	rotation.y = facing_yaw


func snap_facing(dir: Vector3) -> void:
	dir.y = 0.0
	if dir.length_squared() < 0.0002:
		return
	facing_yaw = yaw_for_dir(dir)
	rotation.y = facing_yaw


func begin_grab() -> void:
	var stop_tree := Callable()
	if anim_tree:
		stop_tree = anim_tree.stop_for_pose
	grab_xfade.begin(skeleton, stop_tree, pose_hang_base)


func set_grab_alpha(alpha: float) -> void:
	if skeleton == null:
		return
	if grab_xfade.captured:
		grab_xfade.apply(skeleton, alpha)


func pose_hang_base() -> void:
	_reset_pose()
	_apply_hang_extras(0.0)


func update_visuals(delta: float) -> void:
	if skeleton == null:
		return
	if not auto_animate:
		if anim_tree:
			anim_tree.stop_for_pose()
		_update_markers()
		return
	var st := player.state_name()
	var speed := Vector3(player.velocity.x, 0.0, player.velocity.z).length()
	var grounded := st == "Grounded"
	var grabbing := st == "LedgeGrab"
	var hanging := st == "Hang" or st == "Traverse"
	var climbing := grabbing or hanging or st == "Mantle"
	if not climbing:
		if player.wish_dir.length_squared() > 0.04:
			set_desired_facing(player.wish_dir, delta)
		else:
			set_desired_facing(player.camera_rig.flat_forward(), delta, GameFeel.ROTATE_SPEED * 0.55)
	if climbing:
		if anim_tree and anim_tree.active:
			anim_tree.stop_for_pose()
		if grabbing:
			if not grab_xfade.captured:
				begin_grab()
			grab_xfade.apply(skeleton, player.grab_alpha)
		elif hanging:
			_hang_pose(delta)
		elif st == "Mantle":
			_mantle_pose(delta)
		skeleton.force_update_all_bone_transforms()
		_apply_ik()
		_update_markers()
		return
	var used_tree := anim_tree != null and anim_tree.drive(delta)
	if used_tree:
		_apply_ik()
		_update_markers()
		return
	if grounded or st == "Jump" or st == "Falling" or st == "JumpGrab":
		_locomotion_pose(delta, speed, grounded, st)
	_apply_ik()
	_update_markers()


func rest_pose() -> void:
	if anim_tree:
		anim_tree.stop_for_pose()
	_reset_pose()


func apply_test_rot(bone_name: String, euler: Vector3) -> void:
	_set_rot(bone_name, euler)
	skeleton.force_update_all_bone_transforms()


func _locomotion_pose(delta: float, speed: float, grounded: bool, st: String) -> void:
	var ratio := clampf(speed / GameFeel.WALK_SPEED, 0.0, 1.6)
	phase += delta * lerpf(7.2, 11.8, clampf(ratio, 0.0, 1.0)) * (1.0 if grounded else 0.32)
	var stride := sin(phase) * minf(ratio, 1.15)
	if not grounded:
		stride *= 0.22
	_reset_pose()
	# Bind pose is a T-pose. Extra rotations are composed on top of rest.
	# Arms: Z lowers/raises, X swings forward/back. Legs: X swings forward/back.
	var leg := stride * 0.42
	var arm := stride * 0.9
	if st == "Jump":
		_set_rot("LeftArm", Vector3(-0.35, 0.0, -0.95))
		_set_rot("RightArm", Vector3(0.25, 0.0, 0.95))
		_set_rot("LeftUpLeg", Vector3(0.45, 0.0, 0.0))
		_set_rot("RightUpLeg", Vector3(-0.12, 0.0, 0.0))
		_set_rot("LeftLeg", Vector3(0.55, 0.0, 0.0))
		_set_rot("Spine", Vector3(0.08, 0.0, 0.0))
		return
	if st == "Falling" or st == "JumpGrab":
		_set_rot("LeftArm", Vector3(-0.2, 0.0, -1.15))
		_set_rot("RightArm", Vector3(0.2, 0.0, 1.15))
		_set_rot("LeftUpLeg", Vector3(0.2, 0.0, 0.0))
		_set_rot("RightUpLeg", Vector3(-0.15, 0.0, 0.0))
		_set_rot("Spine", Vector3(0.05, 0.0, 0.0))
		return
	_set_rot("LeftArm", Vector3(-arm, 0.0, -1.55))
	_set_rot("RightArm", Vector3(arm, 0.0, 1.55))
	_set_rot("LeftForeArm", Vector3(0.12 + maxf(arm, 0.0) * 0.35, 0.0, 0.0))
	_set_rot("RightForeArm", Vector3(0.12 + maxf(-arm, 0.0) * 0.35, 0.0, 0.0))
	_set_rot("LeftUpLeg", Vector3(leg, 0.0, 0.0))
	_set_rot("RightUpLeg", Vector3(-leg, 0.0, 0.0))
	_set_rot("LeftLeg", Vector3(maxf(leg, 0.0) * 0.7, 0.0, 0.0))
	_set_rot("RightLeg", Vector3(maxf(-leg, 0.0) * 0.7, 0.0, 0.0))
	_set_rot("Spine", Vector3(0.03 * ratio, 0.0, 0.0))


func _hang_pose(_delta: float) -> void:
	_reset_pose()
	_apply_hang_extras(player.hang_motion_t)


func _apply_hang_extras(motion_t: float) -> void:
	var braced := player.hang_style == ClimbTarget.HangStyle.BRACED
	var breath := 0.0
	var sway := 0.0
	var lag := 0.0
	if motion_t > 0.0:
		breath = sin(motion_t * 1.7) * 0.035
		sway = sin(motion_t * 0.85) * 0.028
		lag = sin(motion_t * 0.85 - 0.55) * 0.04
	_set_rot("LeftArm", Vector3(-1.1 + breath * 0.35, 0.0, -0.4 - breath * 0.2))
	_set_rot("RightArm", Vector3(-1.1 + breath * 0.35, 0.0, 0.4 + breath * 0.2))
	_set_rot("LeftForeArm", Vector3(0.4 + breath * 0.15, 0.0, 0.0))
	_set_rot("RightForeArm", Vector3(0.4 + breath * 0.15, 0.0, 0.0))
	_set_rot("Spine", Vector3((0.08 if braced else 0.16) + breath, sway * 0.35, 0.0))
	_set_rot("Chest", Vector3(breath * 0.55, 0.0, 0.0))
	_set_rot("Hips", Vector3(0.0, sway, 0.0))
	_set_rot("Head", Vector3(-breath * 0.25, -sway * 0.45, 0.0))
	if braced:
		_set_rot("LeftUpLeg", Vector3(0.4 + lag * 0.25, 0.0, 0.0))
		_set_rot("RightUpLeg", Vector3(0.4 - lag * 0.25, 0.0, 0.0))
		_set_rot("LeftLeg", Vector3(0.55 + lag * 0.2, 0.0, 0.0))
		_set_rot("RightLeg", Vector3(0.55 - lag * 0.2, 0.0, 0.0))
	else:
		_set_rot("LeftUpLeg", Vector3(0.08 + lag * 0.15, 0.0, 0.0))
		_set_rot("RightUpLeg", Vector3(0.08 - lag * 0.15, 0.0, 0.0))
		_set_rot("LeftLeg", Vector3(0.12 + lag * 0.2, 0.0, 0.0))
		_set_rot("RightLeg", Vector3(0.12 - lag * 0.2, 0.0, 0.0))
	if player.state_name() == "Traverse":
		_set_rot("Hips", Vector3(0.0, sway + sin(motion_t * 6.0) * 0.05, 0.0))


func _mantle_pose(_delta: float) -> void:
	_reset_pose()
	_set_rot("LeftArm", Vector3(-0.45, 0.0, 0.15))
	_set_rot("RightArm", Vector3(-0.45, 0.0, -0.15))
	_set_rot("LeftUpLeg", Vector3(0.7, 0.0, 0.0))
	_set_rot("RightUpLeg", Vector3(0.2, 0.0, 0.0))
	_set_rot("LeftLeg", Vector3(0.55, 0.0, 0.0))
	_set_rot("Spine", Vector3(0.18, 0.0, 0.0))


func _reset_pose() -> void:
	if skeleton == null:
		return
	for i in skeleton.get_bone_count():
		skeleton.reset_bone_pose(i)


func _set_rot(bone_name: String, euler: Vector3) -> void:
	var idx := int(_bone.get(bone_name, -1))
	if idx < 0:
		return
	# Pose rotation on this rig is the full local rotation, including rest.
	# Extra eulers must be composed onto rest or limbs flip out of the bind pose.
	var rest_q := skeleton.get_bone_rest(idx).basis.get_rotation_quaternion()
	skeleton.set_bone_pose_rotation(idx, rest_q * Quaternion.from_euler(euler))


func _apply_ik() -> void:
	var w := player.ik_weight
	if w <= 0.01 or skeleton == null:
		return
	var t := player.active_target
	if t == null:
		return
	var pole_l := t.ledge_point + t.wall_normal * 0.45 + Vector3.DOWN * 0.2 - t.tangent() * 0.3
	var pole_r := t.ledge_point + t.wall_normal * 0.45 + Vector3.DOWN * 0.2 + t.tangent() * 0.3
	TwoBoneIK.apply(skeleton, int(_bone.get("LeftArm", -1)), int(_bone.get("LeftForeArm", -1)), int(_bone.get("LeftHand", -1)), t.hand_left, pole_l, w)
	TwoBoneIK.apply(skeleton, int(_bone.get("RightArm", -1)), int(_bone.get("RightForeArm", -1)), int(_bone.get("RightHand", -1)), t.hand_right, pole_r, w)


func _update_markers() -> void:
	var show := player.debug_enabled
	for limb_id in Limb.ALL:
		var mi: MeshInstance3D = _limb_markers.get(limb_id)
		if mi == null:
			continue
		mi.visible = show and player.ik_weight > 0.05 and player.active_target != null
		if mi.visible:
			mi.global_position = player.active_target.limb_target(limb_id)


func model_source_name() -> String:
	if using_imported:
		if anim_tree and anim_tree.using_tree:
			return "Quaternius Superhero Male + UAL AnimationTree"
		return "Quaternius Superhero Male (CC0 Standard)"
	return "Procedural mannequin"
