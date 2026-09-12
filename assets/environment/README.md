# 山岳景観の実素材

2026-09-09 導入。Poly HavenのアセットはCC0。

- Rock Face 01 — Dario Barresi — https://polyhaven.com/a/rock_face_01
- Boulder 01 — https://polyhaven.com/a/boulder_01
- Rock Ground 02 — https://polyhaven.com/a/rock_ground_02
- Aerial Grass Rock — https://polyhaven.com/a/aerial_grass_rock（展望地形の草地混合、1K）
- Kloofendal 48d Partly Cloudy Pure Sky — https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky
- ライセンス https://polyhaven.com/license

`source.json` に配布URL・チェックサムを保存。実行時はローカル素材だけを読み込み、APIアクセスしない。
岩と地表は2K、空は1K HDR。色はsRGB、法線・粗さは線形として読み込む。

## 展望地形

`seceda-dem/` は公開のTerrarium標高タイルから作ったSeceda周辺の標高データ。Blenderの
`tools/build-alpine-vista.py` が原解像度のメッシュ（96,621頂点 / 192,000三角形）を
`alpine-vista.glb` へ書き出す。GLBには画像を埋め込まず、ブラウザ側で既存のPBR地表を割り当てる。
対応する配置検討シーンは `alpine-environment-v2.blend`。既存のキャラクター用Sceneは保持している。

`mountainside/` はPoly Havenの同名CC0モデル、`mountainside-lod.glb` はBlenderで12,277三角形へ
軽量化した派生版。遠景の接地と構図を詰めるための候補として保存しており、現在の通常ロードでは使用していない。

## Blenderによる加工

`tools/build-scan-cliff.py`: Rock Face 01を最初の崖へ合わせる。中央の奥行きを圧縮し、既存の登攀判定から表示面が大きく離れないようにする。出力は `first-cliff.blend` と `first-cliff.glb`。原本は保持。

`tools/build-rock-lod.py`: Boulder 01を小岩用に軽量化。材質は元モデルと共有。近景の大岩は元モデルを使用。

地表は3方向投影で急斜面のテクスチャの伸びを抑える。空から環境光を生成する。

まだ元の仮素材が残るもの: 2番目・3番目の登攀壁、遠景の山体、キャラクター。

2026-09-09 軽量化: 小岩は `boulder-lod-v2.glb`（2,314三角形）を使用。従来版26,611三角形は比較用に保持。近景の主役岩の原本は変更していない。

2026-09-09 上部展開: ゲームは `alpine-cliffs.glb`（3壁、10.53 MiB）を使用。`alpine-environment.blend` は接続中Blenderで作成した配置検討シーン。`tools/build-alpine-scene.py` は新しいSceneを作り、選択した岩壁だけをGLBへ書き出す。既存Sceneは削除しない。

2026-09-09 展望地形: Blenderの `03 — DEM vista assembly` を `alpine-vista.glb` としてゲームへ接続。
展望時はゲーム用地面・道標・壁を一時的に隠し、DEM地形と前景のCC0岩だけを表示する。低斜面は
`Aerial Grass Rock`、急斜面・高所は `Rock Ground 02` へ寄せる専用マテリアルを使い、三方向投影の
境界線が出ないよう遠景はXZ一方向投影にしている。

## Blender地形プラグイン

Blender 5.2の公式Extensionsにある [Erosion terrain generator](https://extensions.blender.org/add-ons/erosion-terrain-extension/)
を有効化し、展望用の大形状を生成した。513×513グリッドへ3本の非対称な稜線と谷を与え、
水滴侵食を30,000回適用して谷筋を作る。接続中Blenderの結果は
`alpine-plugin-terrain.blend`、Three.jsへ渡す表示用GLBは
`gaea/plugin-vista.glb`。再生成は `tools/build-plugin-terrain.py` で行う。

`gaea/manifest.json` の `enabled` が `true` の間だけBlender地形を読み込む。GLBには画像を
埋め込まず、ブラウザでロード済みの `Rock Ground 02` を割り当てるため、地形の大形状を
更新しても同じ地表素材を再利用できる。従来の `alpine-vista.glb` はフォールバックとして保持する。

通常プレイでは、このGLBの高さ場を0.75m間隔のゲーム用メッシュへ再構成して `earthMesh` の
表示と衝突に使う。道の周囲は既存ルートの高さへ滑らかに接続するため、歩行・Sneak・登攀壁の
判定はそのままに、道の外側も侵食した山腹として歩ける。高解像度GLBは通常モードでは非表示にし、
展望モードだけで表示する。
