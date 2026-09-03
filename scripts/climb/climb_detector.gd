class_name ClimbDetector
extends Node

## Dynamic ledge detection from collision geometry.
## No designer markers. Any StaticBody / CSG / mesh collider that forms a
## wall + top lip can become a ClimbTarget.

var player: Player
var probes: Array[ClimbProbe] = []
var last_targets: Array[ClimbTarget] = []
var last_fail_reasons: PackedStringArray = PackedStringArray()
var last_best: ClimbTarget
var reach := ReachQuery.new()

const HEIGHTS: Array[float] = [0.35, 0.70, 1.05, 1.35, 1.60, 1.85, 2.15, 2.45, 2.80]
const ANGLES: Array[float] = [-50.0, -28.0, -12.0, 0.0, 12.0, 28.0, 50.0]


func setup(p: Player) -> void:
	player = p
	reach.profile = p.body


func query(opts: Dictionary = {}) -> ClimbTarget:
	probes.clear()
	last_targets.clear()
	last_fail_reasons = PackedStringArray()
	last_best = null
	if player == null:
		return null
	var space := player.get_world_3d().direct_space_state
	if space == null:
		return null
	var origin: Vector3 = opts.get("origin", player.global_position)
	var facing: Vector3 = opts.get("facing", player.intent_flat())
	if facing.length_squared() < 0.0001:
		facing = player.visual_facing()
	facing.y = 0.0
	if facing.length_squared() < 0.0001:
		facing = Vector3.FORWARD
	facing = facing.normalized()
	var airborne: bool = opts.get("airborne", not player.is_on_floor())
	var boost: float = opts.get("boost", 0.0)
	var extra_range: float = GameFeel.GRAB_MAGNET_M + boost
	if airborne:
		extra_range += GameFeel.GRAB_AIR_BONUS_M
	var exclude: Array = opts.get("exclude", [player.get_rid()])
	var seen := {}
	for ang in ANGLES:
		var dir := facing.rotated(Vector3.UP, deg_to_rad(ang))
		for h in HEIGHTS:
			var wall := _ray(
				space,
				origin + Vector3.UP * h - dir * 0.12,
				origin + Vector3.UP * h + dir * (GameFeel.GRAB_FORWARD_M + extra_range),
				exclude,
				Color(0.4, 0.75, 1.0, 0.35),
				"wall"
			)
			if not wall.hit:
				_fail("no_wall")
				continue
			if absf(wall.hit_normal.dot(Vector3.UP)) > GameFeel.MAX_WALL_UP_DOT:
				_fail("not_vertical_enough")
				continue
			var n := Vector3(wall.hit_normal.x, 0.0, wall.hit_normal.z)
			if n.length_squared() < 0.05:
				_fail("bad_wall_normal")
				continue
			n = n.normalized()
			var target := _build_target(space, origin, wall.hit_pos, n, exclude, airborne, extra_range)
			if target == null or not target.valid:
				continue
			var key := "%d_%d_%d" % [
				roundi(target.ledge_point.x * 5.0),
				roundi(target.ledge_point.y * 5.0),
				roundi(target.ledge_point.z * 5.0),
			]
			if seen.has(key):
				continue
			seen[key] = true
			target.score = _score(target, origin, facing, airborne)
			last_targets.append(target)
	last_targets.sort_custom(func(a: ClimbTarget, b: ClimbTarget) -> bool: return a.score > b.score)
	if last_targets.is_empty():
		if last_fail_reasons.is_empty():
			_fail("no_candidate")
		return null
	last_best = last_targets[0]
	return last_best


func query_along_ledge(current: ClimbTarget, side: float, step_m: float = 0.28) -> ClimbTarget:
	if current == null:
		return null
	var along := current.along_right() * signf(side)
	var origin := current.hang_pelvis + along * step_m + current.wall_normal * 0.05
	var found := query({
		"origin": origin + Vector3.DOWN * 0.2,
		"facing": current.facing_dir(),
		"airborne": true,
		"boost": 0.15,
	})
	if found and found.valid:
		return found
	return _try_corner(current, side)


func query_jump(origin: Vector3, dir: Vector3) -> ClimbTarget:
	var predicted := origin
	if player:
		predicted += Vector3(player.velocity.x, 0.0, player.velocity.z) * 0.14
	return query({
		"origin": predicted,
		"facing": dir,
		"airborne": true,
		"boost": GameFeel.JUMP_GRAB_BOOST_M,
	})


func _try_corner(current: ClimbTarget, side: float) -> ClimbTarget:
	var space := player.get_world_3d().direct_space_state
	var exclude := [player.get_rid()]
	var start := current.ledge_point + Vector3.UP * 0.08 + current.wall_normal * 0.18
	var around := (current.along_right() * signf(side) * 0.45 + current.wall_normal * 0.35).normalized()
	var wall := _ray(
		space,
		start + around * 0.05,
		start + around * GameFeel.CORNER_SEARCH_M,
		exclude,
		Color(1.0, 0.6, 0.2, 0.7),
		"corner"
	)
	if not wall.hit:
		_fail("corner_no_wall")
		return null
	var n := Vector3(wall.hit_normal.x, 0.0, wall.hit_normal.z)
	if n.length_squared() < 0.05:
		return null
	n = n.normalized()
	var target := _build_target(space, player.global_position, wall.hit_pos, n, exclude, true, 0.25)
	if target and target.valid:
		target.debug_notes.append("corner_traversal")
		return target
	return null


func _build_target(
	space: PhysicsDirectSpaceState3D,
	feet: Vector3,
	wall_point: Vector3,
	wall_n: Vector3,
	exclude: Array,
	airborne: bool,
	extra_range: float
) -> ClimbTarget:
	var lip := _find_lip(space, wall_point, wall_n, exclude)
	if lip.is_empty():
		_fail("no_ledge_lip")
		return null
	var ledge: Vector3 = lip.point
	var top_n: Vector3 = lip.normal
	var target := ClimbTarget.new()
	target.ledge_point = ledge
	target.wall_normal = wall_n
	target.top_normal = top_n
	target.collider = lip.get("collider", null)
	target.ledge_height_from_feet = ledge.y - feet.y
	var sockets := player.limb_sockets_world()
	var hand_span := player.body.hand_span_m
	var right := target.along_right()
	target.hand_left = ledge - right * hand_span
	target.hand_right = ledge + right * hand_span
	var left_ok: bool = reach.can_reach(sockets[Limb.Id.LEFT_HAND], target.hand_left, Limb.Id.LEFT_HAND, extra_range)
	var right_ok: bool = reach.can_reach(sockets[Limb.Id.RIGHT_HAND], target.hand_right, Limb.Id.RIGHT_HAND, extra_range)
	if not left_ok and not right_ok:
		_fail("out_of_reach")
		_add_probe_label(ledge, "out_of_reach")
		return null
	# One-handed stretch still counts — game feel.
	if not left_ok:
		target.hand_left = target.hand_right - right * (hand_span * 0.7)
		target.debug_notes.append("left_hand_stretch")
	if not right_ok:
		target.hand_right = target.hand_left + right * (hand_span * 0.7)
		target.debug_notes.append("right_hand_stretch")
	var nearer_hand: Vector3 = target.hand_left
	if sockets[Limb.Id.RIGHT_HAND].distance_to(target.hand_right) < sockets[Limb.Id.LEFT_HAND].distance_to(target.hand_left):
		nearer_hand = target.hand_right
	target.reach_units = reach.distance_units(sockets[Limb.Id.LEFT_HAND].lerp(sockets[Limb.Id.RIGHT_HAND], 0.5), nearer_hand)
	target.hang_style = _classify_hang(space, ledge, wall_n, exclude)
	target.hang_pelvis = _hang_pelvis(ledge, wall_n, target.hang_style)
	_place_feet(space, target, exclude)
	var mantle := _evaluate_mantle(space, ledge, wall_n, exclude)
	target.can_stand = mantle.stand
	target.can_mantle = mantle.mantle
	target.stand_position = mantle.stand_pos
	if not target.can_mantle:
		target.debug_notes.append(mantle.reason)
	target.valid = true
	var marker := ClimbProbe.new()
	marker.from = ledge
	marker.to = ledge + wall_n * 0.35
	marker.hit = true
	marker.hit_pos = ledge
	marker.hit_normal = wall_n
	marker.color = Color(0.2, 1.0, 0.35, 1.0)
	marker.label = "climb_target"
	marker.kind = "target"
	probes.append(marker)
	return target


func _find_lip(space: PhysicsDirectSpaceState3D, wall_point: Vector3, wall_n: Vector3, exclude: Array) -> Dictionary:
	var step := 0.055
	var y := wall_point.y
	var max_y := wall_point.y + GameFeel.GRAB_UP_SEARCH_M
	var found_gap := false
	var gap_y := y
	while y < max_y:
		y += step
		var probe_from := Vector3(wall_point.x, y, wall_point.z) + wall_n * 0.05
		var probe_to := probe_from - wall_n * 0.75
		var wall := _ray(space, probe_from, probe_to, exclude, Color(0.8, 0.8, 0.2, 0.18), "lip_up")
		if not wall.hit:
			found_gap = true
			gap_y = y
			break
	if not found_gap:
		# High-to-low fallback: drop a ray just inside the wall.
		var high := Vector3(wall_point.x, wall_point.y + GameFeel.GRAB_UP_SEARCH_M, wall_point.z) - wall_n * 0.16
		var down := _ray(space, high, high + Vector3.DOWN * (GameFeel.GRAB_UP_SEARCH_M + 0.4), exclude, Color(0.9, 0.5, 0.1, 0.4), "lip_down")
		if down.hit and down.hit_normal.dot(Vector3.UP) >= GameFeel.MIN_LEDGE_UP_DOT:
			return _snap_edge(space, down.hit_pos, down.hit_normal, wall_n, exclude, down)
		_fail("wall_continues_up")
		return {}
	var top := ClimbProbe.new()
	var offsets: Array[float] = [0.10, 0.18, 0.30, 0.46, -0.04]
	for off in offsets:
		var above: Vector3 = Vector3(wall_point.x, gap_y + 0.07, wall_point.z) - wall_n * off
		top = _ray(space, above, above + Vector3.DOWN * 0.65, exclude, Color(0.2, 1.0, 0.8, 0.5), "top")
		if top.hit and top.hit_normal.dot(Vector3.UP) >= GameFeel.MIN_LEDGE_UP_DOT:
			break
	if not top.hit:
		_fail("no_top_surface")
		return {}
	if top.hit_normal.dot(Vector3.UP) < GameFeel.MIN_LEDGE_UP_DOT:
		_fail("top_not_walkable_lip")
		return {}
	return _snap_edge(space, top.hit_pos, top.hit_normal, wall_n, exclude, top)


func _snap_edge(
	space: PhysicsDirectSpaceState3D,
	top_point: Vector3,
	top_n: Vector3,
	wall_n: Vector3,
	exclude: Array,
	top_probe: ClimbProbe
) -> Dictionary:
	var start := top_point + Vector3.UP * 0.03 + wall_n * 0.62
	var edge := _ray(space, start, top_point + Vector3.UP * 0.03 - wall_n * 0.15, exclude, Color(1.0, 1.0, 0.2, 0.7), "edge")
	var point := top_point
	if edge.hit:
		point = edge.hit_pos + wall_n * 0.02
	else:
		point = top_point + wall_n * 0.02
	# Depth check: is there any top surface inward?
	var depth := _ray(
		space,
		point - wall_n * 0.12 + Vector3.UP * 0.04,
		point - wall_n * 0.12 + Vector3.DOWN * 0.2,
		exclude,
		Color(0.6, 0.9, 1.0, 0.3),
		"depth"
	)
	if not depth.hit:
		_fail("ledge_too_thin")
		# Still allow a very thin lip — game feel — if the top ray itself hit.
		if top_probe.hit:
			pass
		else:
			return {}
	return {
		"point": point,
		"normal": top_n,
		"collider": top_probe.collider if top_probe.hit else null,
	}


func _classify_hang(space: PhysicsDirectSpaceState3D, ledge: Vector3, wall_n: Vector3, exclude: Array) -> int:
	var hip := ledge + Vector3.DOWN * 0.72 + wall_n * 0.08
	var foot := _ray(
		space,
		hip + wall_n * 0.12,
		hip - wall_n * GameFeel.FOOT_SUPPORT_MAX_M + Vector3.DOWN * 0.25,
		exclude,
		Color(0.9, 0.3, 0.8, 0.6),
		"foot_support"
	)
	if not foot.hit:
		return ClimbTarget.HangStyle.FREE
	if foot.hit_normal.dot(Vector3.UP) < -0.25:
		return ClimbTarget.HangStyle.FREE
	if absf(foot.hit_normal.dot(Vector3.UP)) <= GameFeel.MAX_WALL_UP_DOT + 0.08:
		return ClimbTarget.HangStyle.BRACED
	return ClimbTarget.HangStyle.FREE


func _place_feet(space: PhysicsDirectSpaceState3D, target: ClimbTarget, exclude: Array) -> void:
	var right := target.along_right()
	var hip := target.hang_pelvis
	for i in 2:
		var side := -1.0 if i == 0 else 1.0
		var start := hip + right * (0.11 * side) + Vector3.DOWN * 0.12 + target.wall_normal * 0.08
		var hit := _ray(
			space,
			start,
			start - target.wall_normal * 0.7 + Vector3.DOWN * 0.35,
			exclude,
			Color(0.8, 0.45, 0.2, 0.5),
			"foot"
		)
		var pos: Vector3
		if hit.hit:
			pos = hit.hit_pos + hit.hit_normal * 0.03
		else:
			pos = hip + right * (0.1 * side) + Vector3.DOWN * 0.85 + target.wall_normal * 0.05
		if i == 0:
			target.foot_left = pos
		else:
			target.foot_right = pos


func _evaluate_mantle(space: PhysicsDirectSpaceState3D, ledge: Vector3, wall_n: Vector3, exclude: Array) -> Dictionary:
	var stand := ledge - wall_n * GameFeel.MANTLE_STAND_INSET_M + Vector3.UP * 0.05
	var ground := _ray(space, stand + Vector3.UP * 0.6, stand + Vector3.DOWN * 1.1, exclude, Color(0.4, 1.0, 0.4, 0.45), "mantle_ground")
	if not ground.hit:
		return {"stand": false, "mantle": false, "stand_pos": stand, "reason": "no_stand_space"}
	if ground.hit_normal.dot(Vector3.UP) < 0.55:
		return {"stand": false, "mantle": false, "stand_pos": stand, "reason": "stand_too_steep"}
	stand.y = ground.hit_pos.y
	var shape := CapsuleShape3D.new()
	shape.radius = 0.30
	shape.height = 1.55
	var params := PhysicsShapeQueryParameters3D.new()
	params.shape = shape
	params.transform = Transform3D(Basis.IDENTITY, stand + Vector3.UP * 0.90)
	params.exclude = exclude
	params.collision_mask = 1
	var hits := space.intersect_shape(params, 6)
	if not hits.is_empty():
		# Slightly more inset retry.
		stand = ledge - wall_n * (GameFeel.MANTLE_STAND_INSET_M + 0.22) + Vector3.UP * 0.05
		ground = _ray(space, stand + Vector3.UP * 0.6, stand + Vector3.DOWN * 1.1, exclude, Color(0.3, 0.9, 0.3, 0.3), "mantle_retry")
		if ground.hit:
			stand.y = ground.hit_pos.y
			params.transform = Transform3D(Basis.IDENTITY, stand + Vector3.UP * 0.90)
			hits = space.intersect_shape(params, 6)
		if not hits.is_empty():
			return {"stand": false, "mantle": false, "stand_pos": stand, "reason": "ceiling_or_blocked"}
	return {"stand": true, "mantle": true, "stand_pos": stand, "reason": ""}


func _hang_pelvis(ledge: Vector3, wall_n: Vector3, style: int) -> Vector3:
	var back := GameFeel.HANG_BACK_BRACED_M
	var drop := GameFeel.HANG_DROP_BRACED_M
	if style == ClimbTarget.HangStyle.FREE:
		back = GameFeel.HANG_BACK_FREE_M
		drop = GameFeel.HANG_DROP_FREE_M
	return ledge + wall_n * back + Vector3.DOWN * drop


func _score(target: ClimbTarget, origin: Vector3, facing: Vector3, airborne: bool) -> float:
	var to_ledge := target.ledge_point - (origin + Vector3.UP * 1.4)
	var dist := to_ledge.length()
	var align := facing.dot(target.facing_dir())
	var height := target.ledge_height_from_feet
	var score := 12.0 - dist * 2.4 + align * 3.5
	if height < 0.7:
		score -= 2.0
	if height > 2.8:
		score -= (height - 2.8) * 1.5
	if target.can_mantle:
		score += 0.4
	if airborne:
		score += 0.6
	score += 1.4 / maxf(target.reach_units, 0.4)
	return score


func _ray(
	space: PhysicsDirectSpaceState3D,
	from: Vector3,
	to: Vector3,
	exclude: Array,
	color: Color,
	label: String
) -> ClimbProbe:
	var probe := ClimbProbe.new()
	probe.from = from
	probe.to = to
	probe.color = color
	probe.label = label
	var q := PhysicsRayQueryParameters3D.create(from, to)
	q.exclude = exclude
	q.collision_mask = 1
	q.hit_from_inside = true
	var hit := space.intersect_ray(q)
	if hit:
		probe.hit = true
		probe.hit_pos = hit.position
		probe.hit_normal = hit.normal
		probe.collider = hit.get("collider", null)
	probes.append(probe)
	return probe


func _fail(reason: String) -> void:
	if last_fail_reasons.size() < 12 and not last_fail_reasons.has(reason):
		last_fail_reasons.append(reason)


func _add_probe_label(pos: Vector3, text: String) -> void:
	var p := ClimbProbe.new()
	p.from = pos
	p.to = pos + Vector3.UP * 0.2
	p.hit = true
	p.hit_pos = pos
	p.color = Color(1.0, 0.2, 0.2)
	p.label = text
	p.kind = "reason"
	probes.append(p)


func summary_text() -> String:
	var lines: PackedStringArray = PackedStringArray()
	if last_best and last_best.valid:
		lines.append("BEST: %s  score=%.1f" % [last_best.hang_style_name(), last_best.score])
		lines.append("ledge h=%.2fm  reach=%.1fu  mantle=%s" % [
			last_best.ledge_height_from_feet,
			last_best.reach_units,
			str(last_best.can_mantle),
		])
		if not last_best.debug_notes.is_empty():
			lines.append("notes: " + ", ".join(last_best.debug_notes))
	else:
		lines.append("NO VALID CLIMB TARGET")
		if last_fail_reasons.is_empty():
			lines.append("why: no geometry in front")
		else:
			lines.append("why: " + ", ".join(last_fail_reasons))
	lines.append("candidates=%d  probes=%d" % [last_targets.size(), probes.size()])
	return "\n".join(lines)
