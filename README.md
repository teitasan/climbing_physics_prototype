# Climbing Physics Prototype

三人称アクションの移動から、そのまま岩棚へ飛びつき・ぶら下がり・横移動・よじ登り・飛び移りできるかを検証するための Godot 4.x プロトタイプです。完成した登山ゲームではなく、**操作感の確認用**です。

旧 HTML の Hex クライミング試作 (`index.html`, `climbing_puzzle_prototype.html`) はこのフォルダに残してあります。本 README は Godot 3D プロトタイプの説明です。

## 起動方法

必要環境: [Godot 4.7.x](https://godotengine.org/download/)（開発時は 4.7.2 / Forward+）

```bash
cd climbing_physics_prototype
godot --path .
```

または Godot エディタで `project.godot` を開いて実行します。エディタ上の手動セットアップは不要です。シーン・入力・地形はすべてスクリプトから構築します。

ヘッドレス確認:

```bash
godot --headless --path . --quit-after 2
godot --headless --path . -s res://tools/smoke_test.gd
godot --headless --path . -s res://tools/check_model.gd
godot --headless --path . -s res://tools/check_anim.gd
godot --headless --path . -s res://tools/playtest.gd
```

## 操作方法

| 入力 | 地上 | ぶら下がり |
| --- | --- | --- |
| WASD | カメラ基準の移動 | A/D 横移動（Traverse）、W よじ登り（Mantle） |
| マウス | 視点 | 視点 |
| Shift | ダッシュ | — |
| Space | ジャンプ。空中で棚に手が届けば自動で掴む | 入力方向へ Jump Grab |
| S / X | — | ドロップ |
| F1 | デバッグ表示の ON/OFF | 同左 |
| R | スタート地点へリセット | 同左 |
| Esc | マウスキャプチャ切替 | 同左 |

判定は意図的に甘めです。近い棚への吸着、空中の入力補正、grab の猶予は `scripts/core/game_feel.gd` の定数で後から厳しくできます。

## テストコース

スタート（Z 正方向）から順に試せます。

1. 歩行・走行・ジャンプ
2. 坂
3. 低い段差（ステップアップ）
4. 跳び溝
5. 低い壁 → Ledge Grab → Mantle
6. Cat Hang の横移動 ledge
7. 足場のない overhang（Free Hang）
8. 2 本の柱（Jump Grab）
9. 高い Mantle
10. ストレッチが必要な棚
11. 登れない壁（横を迂回）
12. ゴール

Marker は置いていません。同じ条件を満たす Box / CSG なら登れます。

## システム構成

```
Player (CharacterBody3D)
├ StateMachine … Grounded / Jump / Falling / LedgeGrab / Hang / Traverse / Mantle / JumpGrab
├ ClimbDetector … 地形から棚を動的検出
├ PlayerVisuals … ヒューマノイド + AnimationTree（UAL）+ 二骨 IK
├ PlayerCamera … 三人称カメラ
└ ClimbDebug / DebugHud
```

到達判定は `ReachQuery` + `ReachUnits` に分離しています。1 単位 = 25cm で、後からグリッド判定へ差し替えできます。手足は `Limb`（左手 / 右手 / 左足 / 右足）として扱います。

表示は次の順です。

```
Player State
 → AnimationTree（Locomotion は m/s の BlendSpace + TimeScale。JumpStart / JumpLoop / JumpLand は travel + cross fade）
 → LedgeGrab 時は Jump 姿勢を保持して Hang へ 0.2 秒補間 + 手 IK
 → Hang は基礎ポーズ + 呼吸/揺れ + 手 IK
 → Traverse は左手→骨盤→左足→右手→右足の順で約 30cm ずつ動かす
 → TwoBoneIK（登攀中の手。Traverse 中の移動脚にも一時的に）
```

ヘッドレス確認に `godot --headless --path . -s res://tools/check_anim.gd` を追加できます。

## 登攀判定の仕組み

レベルに棚 Marker を置かず、`PhysicsDirectSpaceState3D` のレイで地形そのものを見ます。

1. キャラ前方を複数の高さ・角度でレイし、垂直に近い壁を取る
2. 壁に沿って上へ探り、壁が途切れる所を lip とする
3. 壁の**内側**へダウンキャストして上面を取る
4. 肩ソケットから手までの距離を 25cm 単位で評価（`GameFeel` の余裕を加算）
5. カプセル Shape で Mantle 可能な立ちスペースを見る
6. 腰付近から壁へレイし、足が置けるなら Cat/Braced、置けなければ Free Hang

失敗理由（`no_wall`, `out_of_reach`, `no_ledge_lip`, `ceiling_or_blocked` など）は F1 デバッグに出ます。

## 使用した外部素材

`THIRD_PARTY.md` を参照してください。

- プロトタイプ本体: MIT
- Quaternius Universal Base Characters **Standard (CC0)** を同梱。無料版に含まれる Superhero Male + Hair_SimpleParted を使用（Regular 体型は Source 版のみ）
- Quaternius Universal Animation Library **Standard (CC0)** を同梱。Idle / Walk / Jog / Sprint / Jump を AnimationTree で再生
- OpenClimber はライセンス未設定のため **コードは未使用**（設計の参考のみ）
- ProjectUltraversal は GPL-3.0 のため **コードは未使用**（状態設計の参考のみ）

Quaternius Regular Male / Female を使う場合は `assets/characters/README.txt` に従って GLB を置いてください。置かない場合は同一ボーン名のプロシージャルマネキンで IK と移動が動きます。

## 現時点の制限

- Hang / Mantle は Standard パックにクリップが無いため、まだプロシージャル。LedgeGrab は Jump 姿勢を 0.2 秒で Hang へ補間する
- Traverse は 30cm ステップの四肢順移動（25cm Hex にはまだしていない）
- コーナー回り込みは簡易。複雑な凹凸や連続ホールド移動は未実装
- 身長・腕長による到達差は BodyProfile まで。Hex グリッド化は未適用
- 登攀中の手は TwoBoneIK。地上の足裏合わせは未実装
- スタミナ / ロープ / 山岳生成 / 戦闘は対象外

## 次に改善すべきポイント

1. Traverse の四肢タイミングと到達（25cm Reach）の見た目調整
2. Mantle（カプセル・骨盤・手足を棚上へ同期）
3. Jump Grab / Dyno
4. Hang Idle の二次モーション強化
5. Hang / Mantle の実クリップは後回し（Standard には無い）

## ブラウザ版 白峰マップ

Mesh Terrain Labから取り込んだ白峰・東峰の登山マップをブラウザで遊べます。GitHub Pagesでは [`shiramine.html`](./shiramine.html) を開いてください。地形の仕様と実測値は [`SHIRAMINE_BENCHMARK.md`](./SHIRAMINE_BENCHMARK.md)、操作と検証手順は [`SHIRAMINE_MAP.md`](./SHIRAMINE_MAP.md) に記録しています。
