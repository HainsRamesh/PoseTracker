// Maps MediaPipe 33 landmarks to Unity CC_Base_ bone names
// This is used on the Unity side, but we define the mapping here
// so the phone sends data in the correct format

export const MEDIAPIPE_LANDMARKS = {
  0: 'nose',
  1: 'left_eye_inner',
  2: 'left_eye',
  3: 'left_eye_outer',
  4: 'right_eye_inner',
  5: 'right_eye',
  6: 'right_eye_outer',
  7: 'left_ear',
  8: 'right_ear',
  9: 'mouth_left',
  10: 'mouth_right',
  11: 'left_shoulder',
  12: 'right_shoulder',
  13: 'left_elbow',
  14: 'right_elbow',
  15: 'left_wrist',
  16: 'right_wrist',
  17: 'left_pinky',
  18: 'right_pinky',
  19: 'left_index',
  20: 'right_index',
  21: 'left_thumb',
  22: 'right_thumb',
  23: 'left_hip',
  24: 'right_hip',
  25: 'left_knee',
  26: 'right_knee',
  27: 'left_ankle',
  28: 'right_ankle',
  29: 'left_heel',
  30: 'right_heel',
  31: 'left_foot_index',
  32: 'right_foot_index',
};

// Mapping: MediaPipe landmark groups → Unity CC_Base_ bones
// Each bone rotation is calculated from a chain of landmarks
export const BONE_MAPPING = {
  // Spine & Torso
  CC_Base_Hip: { landmarks: [23, 24, 11, 12], type: 'root' },
  CC_Base_Waist: { landmarks: [23, 24, 11, 12], type: 'spine' },
  CC_Base_Spine01: { landmarks: [23, 24, 11, 12], type: 'spine' },
  CC_Base_Spine02: { landmarks: [11, 12, 0], type: 'upper_spine' },

  // Head & Neck
  CC_Base_NeckTwist01: { landmarks: [11, 12, 0, 7, 8], type: 'neck' },
  CC_Base_Head: { landmarks: [0, 7, 8, 2, 5], type: 'head' },

  // Left Arm
  CC_Base_L_Clavicle: { landmarks: [12, 11], type: 'clavicle' },
  CC_Base_L_Upperarm: { from: 11, to: 13, type: 'limb' },
  CC_Base_L_Forearm: { from: 13, to: 15, type: 'limb' },
  CC_Base_L_Hand: { from: 15, to: 19, type: 'limb' },

  // Right Arm
  CC_Base_R_Clavicle: { landmarks: [11, 12], type: 'clavicle' },
  CC_Base_R_Upperarm: { from: 12, to: 14, type: 'limb' },
  CC_Base_R_Forearm: { from: 14, to: 16, type: 'limb' },
  CC_Base_R_Hand: { from: 16, to: 20, type: 'limb' },

  // Left Leg
  CC_Base_L_Thigh: { from: 23, to: 25, type: 'limb' },
  CC_Base_L_Calf: { from: 25, to: 27, type: 'limb' },
  CC_Base_L_Foot: { from: 27, to: 31, type: 'limb' },

  // Right Leg
  CC_Base_R_Thigh: { from: 24, to: 26, type: 'limb' },
  CC_Base_R_Calf: { from: 26, to: 28, type: 'limb' },
  CC_Base_R_Foot: { from: 28, to: 32, type: 'limb' },
};

// Calculate bone rotation from two landmark positions
// Returns Euler angles (x, y, z) in degrees
export function calcBoneRotation(fromLandmark, toLandmark) {
  const dx = toLandmark.x - fromLandmark.x;
  const dy = toLandmark.y - fromLandmark.y;
  const dz = (toLandmark.z || 0) - (fromLandmark.z || 0);

  // Calculate rotation angles
  const rotX = Math.atan2(dy, dz) * (180 / Math.PI);
  const rotY = Math.atan2(dx, dz) * (180 / Math.PI);
  const rotZ = Math.atan2(dy, dx) * (180 / Math.PI);

  return { x: rotX, y: rotY, z: rotZ };
}

// Process all landmarks into bone rotations for Unity
export function processLandmarksToBones(landmarks) {
  if (!landmarks || landmarks.length < 33) return null;

  const boneRotations = {};

  for (const [boneName, config] of Object.entries(BONE_MAPPING)) {
    if (config.type === 'limb' && config.from !== undefined) {
      const from = landmarks[config.from];
      const to = landmarks[config.to];
      if (from && to) {
        boneRotations[boneName] = calcBoneRotation(from, to);
      }
    }
  }

  // Root position (hip center)
  const hipMid = {
    x: (landmarks[23].x + landmarks[24].x) / 2,
    y: (landmarks[23].y + landmarks[24].y) / 2,
    z: ((landmarks[23].z || 0) + (landmarks[24].z || 0)) / 2,
  };

  return {
    boneRotations,
    rootPosition: hipMid,
    rawLandmarks: landmarks,
  };
}