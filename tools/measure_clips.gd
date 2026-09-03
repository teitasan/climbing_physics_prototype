extends SceneTree

## Samples UAL locomotion clips on the player skeleton and prints native m/s.


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	root.add_child((load("res://scenes/main.tscn") as PackedScene).instantiate())
	var player: Player
	for i in 40:
		await physics_frame
		player = root.find_child("Player", true, false)
		if player and player.visuals and player.visuals.anim_tree:
			break
	if player == null or player.visuals.anim_tree == null:
		push_error("no anim tree")
		quit(1)
		return
	var tree: PlayerAnimTree = player.visuals.anim_tree
	tree.active = false
	var ap: AnimationPlayer = tree.ap
	var skel: Skeleton3D = player.visuals.skeleton
	for clip in ["Idle", "Walk", "Jog_Fwd", "Sprint", "Jump_Start", "Jump", "Jump_Land"]:
		if not ap.has_animation(clip):
			print("MISSING ", clip)
			continue
		_measure(ap, skel, clip)
	quit(0)


func _measure(ap: AnimationPlayer, skel: Skeleton3D, clip: String) -> void:
	var anim: Animation = ap.get_animation(clip)
	var len := anim.length
	print("==== ", clip, " len=", snapped(len, 0.001), " loop=", anim.loop_mode)
	_print_pos_tracks(anim)
	ap.play(clip)
	ap.speed_scale = 0.0
	var hips := skel.find_bone("Hips")
	var lfoot := skel.find_bone("LeftFoot")
	var rfoot := skel.find_bone("RightFoot")
	var samples := 48
	var hips_xz: Array[Vector3] = []
	var l_z: Array[float] = []
	var r_z: Array[float] = []
	for i in samples:
		var t := len * float(i) / float(samples - 1)
		ap.seek(t, true)
		ap.advance(0.0)
		skel.force_update_all_bone_transforms()
		var hg: Vector3 = (skel.global_transform * skel.get_bone_global_pose(hips)).origin
		hips_xz.append(Vector3(hg.x, 0.0, hg.z))
		l_z.append((skel.global_transform * skel.get_bone_global_pose(lfoot)).origin.z)
		r_z.append((skel.global_transform * skel.get_bone_global_pose(rfoot)).origin.z)
	var hip_travel := 0.0
	for i in range(1, hips_xz.size()):
		hip_travel += hips_xz[i].distance_to(hips_xz[i - 1])
	var l_stride := _peak_to_peak(l_z)
	var r_stride := _peak_to_peak(r_z)
	var stride := 0.5 * (l_stride + r_stride)
	# Two steps per loop for walk/run.
	var stride_speed := (stride * 2.0) / maxf(len, 0.001)
	var hip_speed := hip_travel / maxf(len, 0.001)
	print("  hip_path=", snapped(hip_travel, 0.001), " m  hip_mps=", snapped(hip_speed, 0.001))
	print("  foot_pp L=", snapped(l_stride, 0.001), " R=", snapped(r_stride, 0.001), " stride_mps=", snapped(stride_speed, 0.001))
	ap.stop()


func _peak_to_peak(values: Array[float]) -> float:
	var lo := 999.0
	var hi := -999.0
	for v in values:
		lo = minf(lo, v)
		hi = maxf(hi, v)
	return hi - lo


func _print_pos_tracks(anim: Animation) -> void:
	for i in anim.get_track_count():
		if anim.track_get_type(i) != Animation.TYPE_POSITION_3D:
			continue
		var p := String(anim.track_get_path(i))
		if p.contains("Root") or p.contains("Hips"):
			var a: Vector3 = anim.position_track_interpolate(i, 0.0)
			var b: Vector3 = anim.position_track_interpolate(i, anim.length)
			print("  pos ", p, " d=", snapped((b - a).length(), 0.004), " a=", a, " b=", b)
