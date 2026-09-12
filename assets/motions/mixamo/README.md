# Mixamo モーションの差し込み場所

ここに Mixamo の `.fbx` を置き、`manifest.example.json` を `manifest.json` に
リネームすると、CMU BVH 版のクライミングクリップを上書きできる。
`manifest.json` が無ければ何も起きない（CMU 版のまま動く）。

## ライセンス上の注意

Mixamo のモーションは「作品に組み込んで使う」ことは商用・非商用どちらも無料だが、
**生のアニメーションファイル単体の再配布は不可**。
`.fbx` は `.gitignore` してある（`manifest.json` はコミットして構わない）。

## ダウンロード設定

| 項目 | 値 |
|---|---|
| Format | FBX Binary (.fbx) |
| Skin | **Without Skin**（スケルトンとアニメーションのみ。軽い） |
| Frames per Second | 30 |
| Keyframe Reduction | none |

`In Place` はどちらでもよい。オフでも `manifest.json` の `inPlace: true` 側で
root motion を抜き、抜いた量は `clip.userData.rootMotion` に残して移動速度と同期させる。

## 検証済みの事実

- FBXLoader → retargeting-threejs → Quaternius リグ で **52/52 ボーンが対応**
- 腰基準の手足・頭の方向誤差は **最大 6°**（CMU BVH からのリターゲットでは 40〜90°）
- 指ボーンも繋がるので、ホールドを掴む手の形が乗る

検証ページ: `debug/mixamo.html`（`.fbx` を 1 本置いてパスを書き換えれば動く）
