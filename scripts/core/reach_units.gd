class_name ReachUnits
extends RefCounted

## Future climbing sim uses 25cm as 1 discrete unit.
## Keep all reach math behind this helper so a grid swap is local.
const METERS_PER_UNIT := 0.25


static func meters_to_units(meters: float) -> float:
	return meters / METERS_PER_UNIT


static func units_to_meters(units: float) -> float:
	return units * METERS_PER_UNIT


static func quantize_meters(meters: float) -> float:
	return units_to_meters(round(meters_to_units(meters)))


static func quantize_point(point: Vector3) -> Vector3:
	return Vector3(
		quantize_meters(point.x),
		quantize_meters(point.y),
		quantize_meters(point.z)
	)
