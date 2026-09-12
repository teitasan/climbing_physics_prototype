// CMU (cgspeed BVH) -> Quaternius Universal Animation Library (Rigify DEF-* リグ) のボーン対応表。
// CMU 側の LHipJoint / RHipJoint / Neck1 / 指・つま先の一部は対応先が無いので意図的に未マップ。
export const CMU_TO_QUATERNIUS = {
  Hips:          'DEF-hips',
  LowerBack:     'DEF-spine.001',
  Spine:         'DEF-spine.002',
  Spine1:        'DEF-spine.003',
  Neck:          'DEF-neck',
  Head:          'DEF-head',

  LeftShoulder:  'DEF-shoulder.L',
  LeftArm:       'DEF-upper_arm.L',
  LeftForeArm:   'DEF-forearm.L',
  LeftHand:      'DEF-hand.L',
  RightShoulder: 'DEF-shoulder.R',
  RightArm:      'DEF-upper_arm.R',
  RightForeArm:  'DEF-forearm.R',
  RightHand:     'DEF-hand.R',

  LeftUpLeg:     'DEF-thigh.L',
  LeftLeg:       'DEF-shin.L',
  LeftFoot:      'DEF-foot.L',
  LeftToeBase:   'DEF-toe.L',
  RightUpLeg:    'DEF-thigh.R',
  RightLeg:      'DEF-shin.R',
  RightFoot:     'DEF-foot.R',
  RightToeBase:  'DEF-toe.R',
};

// IK / 接地点計算で使う Quaternius 側のボーン名
export const RIG = {
  hips: 'DEF-hips',
  chest: 'DEF-spine.003',
  head: 'DEF-head',
  limbs: {
    leftHand:  { root: 'DEF-upper_arm.L', mid: 'DEF-forearm.L', end: 'DEF-hand.L' },
    rightHand: { root: 'DEF-upper_arm.R', mid: 'DEF-forearm.R', end: 'DEF-hand.R' },
    leftFoot:  { root: 'DEF-thigh.L',     mid: 'DEF-shin.L',    end: 'DEF-foot.L' },
    rightFoot: { root: 'DEF-thigh.R',     mid: 'DEF-shin.R',    end: 'DEF-foot.R' },
  },
};

/** glTF 名 -> ランタイムのボーン名（GLTFLoader が ".:/[]" を除去する）*/
export const sanitize = (n) => n.replace(/[.:/[\]]/g, '');
