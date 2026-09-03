class_name ClimbProbe
extends RefCounted

var from := Vector3.ZERO
var to := Vector3.ZERO
var hit := false
var hit_pos := Vector3.ZERO
var hit_normal := Vector3.UP
var color := Color.WHITE
var label := ""
var kind := "ray"
var collider: Object
