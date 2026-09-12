# 白峰・東峰：ブラウザ登山マップ

起動：プロジェクト直下で `python3 tools/serve.py 8125` を実行し、http://localhost:8125/shiramine.html を開く。

ポリゴン数・テクスチャ品質・容量・実測FPSは [SHIRAMINE_BENCHMARK.md](SHIRAMINE_BENCHMARK.md) に記録している。

Mesh Terrain Lab で保存した `meshterrain-godot-20260910004119.zip` の地形を取り込んだ試作。4,096m四方、618,613三角形（約62万ポリゴン）の地形を実寸で使用し、表示メッシュを歩行用衝突判定にも使用。元の編集データは `assets/environment/meshterrain-shiramine/source/meshterrain-world.json` に保存してある。

登山口から東峰まで約1.57km、累積上り約315m。黄色い道標と地面のラインに沿って進む。途中3地点と山頂にチェックポイントがある。画面の標高はゲーム用の仮設定。

- WASD：移動、Shift：走る、Space：ジャンプ
- 画面をクリックしてマウス：TPS視点、Esc：マウス解放、Q・E：旋回、ホイール：カメラ距離
- M：全体表示、R：到達済みチェックポイントから再開
- 画質ボタン：標準／軽量

地形編集は Mesh Terrain Lab 側で行う。ゲームとのリアルタイム同期は未実装。表示用の地形はそのままに、登攀判定にはパッチ端のスカートを除去した専用メッシュと境界ブリッジを使い、継ぎ目で止まる問題を吸収している。既存ゲームのファイルは変更せず、独立した入口を追加している。

## 検証

`shiramine.html?test=1` の「歩行ルートを検証」は実際の Character.update と地形衝突を使用する。全436地点を15,241ステップで走破、停止・地形落下なしを確認。これは描画を省いた固定時間刻みの移動検証で、手動操作の全状況を保証するものではない。起動時のブラウザコンソールエラーなし。M1 Proで登山口の表示は約100〜120fps（画面サイズ・視点で変動）。

ルート再生成：`node --no-warnings --experimental-loader ./tools/shiramine-loader.mjs tools/build-shiramine-route.mjs`。このコマンドは `route.json` を再生成するため、手動編集した場合は先に別名で保存すること。
