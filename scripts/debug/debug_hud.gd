class_name DebugHud
extends CanvasLayer

var player: Player
var label: Label
var hint: Label


func setup(p: Player) -> void:
	player = p
	layer = 20
	label = Label.new()
	label.position = Vector2(18, 16)
	label.add_theme_font_size_override("font_size", 16)
	label.add_theme_color_override("font_color", Color(0.95, 0.96, 0.9))
	label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.8))
	label.add_theme_constant_override("outline_size", 4)
	add_child(label)
	hint = Label.new()
	hint.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	hint.offset_left = 18
	hint.offset_right = -18
	hint.offset_bottom = -16
	hint.offset_top = -48
	hint.add_theme_font_size_override("font_size", 15)
	hint.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.8))
	hint.add_theme_constant_override("outline_size", 4)
	hint.text = "WASD 移動  |  マウス視点  |  Shift ダッシュ  |  Space ジャンプ / 飛びつき  |  ぶら下がり中 W よじ登り  A/D 横移動  S/X ドロップ  |  F1 デバッグ  |  R リセット  |  Esc カーソル"
	add_child(hint)


func refresh() -> void:
	if player == null:
		return
	label.visible = player.debug_enabled
	if not player.debug_enabled:
		return
	var st := player.state_name()
	var lines := PackedStringArray()
	lines.append("STATE  %s" % st)
	if player.active_target:
		lines.append("HANG   %s" % player.active_target.hang_style_name())
	lines.append("VEL    (%.1f, %.1f, %.1f)" % [player.velocity.x, player.velocity.y, player.velocity.z])
	lines.append("POS    (%.1f, %.1f, %.1f)" % [player.global_position.x, player.global_position.y, player.global_position.z])
	lines.append("MODEL  %s" % player.visuals.model_source_name())
	var tree_on := player.visuals.anim_tree != null and player.visuals.anim_tree.active
	lines.append("IK     %.2f  grab=%.2f  tree=%s" % [player.ik_weight, player.grab_alpha, "on" if tree_on else "off"])
	lines.append("")
	if player.detector:
		lines.append(player.detector.summary_text())
	label.text = "\n".join(lines)
