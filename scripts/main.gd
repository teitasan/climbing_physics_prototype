extends Node3D


func _ready() -> void:
	_build_env()
	var course := TestCourse.new()
	add_child(course)
	var player := Player.new()
	player.name = "Player"
	add_child(player)
	player.spawn_position = course.spawn_position
	player.global_position = course.spawn_position


func _build_env() -> void:
	var sun := DirectionalLight3D.new()
	sun.name = "Sun"
	sun.rotation_degrees = Vector3(-48, 35, 0)
	sun.light_energy = 1.15
	sun.light_color = Color(1.0, 0.96, 0.88)
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 80.0
	add_child(sun)

	var env := Environment.new()
	env.background_mode = Environment.BG_SKY
	var sky := Sky.new()
	var sky_mat := ProceduralSkyMaterial.new()
	sky_mat.sky_top_color = Color(0.35, 0.56, 0.78)
	sky_mat.sky_horizon_color = Color(0.78, 0.7, 0.58)
	sky_mat.ground_bottom_color = Color(0.18, 0.2, 0.16)
	sky_mat.ground_horizon_color = Color(0.55, 0.5, 0.4)
	sky_mat.sun_angle_max = 30.0
	sky.sky_material = sky_mat
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_energy = 0.62
	env.tonemap_mode = Environment.TONE_MAPPER_ACES
	env.tonemap_exposure = 1.05
	env.fog_enabled = true
	env.fog_density = 0.0018
	env.fog_light_color = Color(0.7, 0.75, 0.8)
	env.glow_enabled = false
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
