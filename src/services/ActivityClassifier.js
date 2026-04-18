// Landmark indices from MediaPipe Pose (33 landmarks)
const LANDMARK = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
};

class ActivityClassifier {
  constructor() {
    this.prevHipY = null;
    this.prevActivity = 'idle';
    this.jumpCooldown = 0;
    this.accelHistory = [];
    this.hipYHistory = [];
    this.maxHistorySize = 30; // ~1.5 seconds at 20fps
  }

  // Calculate angle between three landmarks (in degrees)
  _angle(a, b, c) {
    const ab = { x: a.x - b.x, y: a.y - b.y };
    const cb = { x: c.x - b.x, y: c.y - b.y };
    const dot = ab.x * cb.x + ab.y * cb.y;
    const magAB = Math.sqrt(ab.x * ab.x + ab.y * ab.y);
    const magCB = Math.sqrt(cb.x * cb.x + cb.y * cb.y);
    if (magAB === 0 || magCB === 0) return 0;
    const cosAngle = Math.max(-1, Math.min(1, dot / (magAB * magCB)));
    return Math.acos(cosAngle) * (180 / Math.PI);
  }

  // Calculate distance between two landmarks
  _dist(a, b) {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
  }

  // Get mid-point of two landmarks
  _mid(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  classify(landmarks, accelData) {
    if (!landmarks || landmarks.length < 33) {
      return { activity: 'idle', confidence: 0 };
    }

    const lm = landmarks;
    const hipMid = this._mid(lm[LANDMARK.LEFT_HIP], lm[LANDMARK.RIGHT_HIP]);
    const shoulderMid = this._mid(lm[LANDMARK.LEFT_SHOULDER], lm[LANDMARK.RIGHT_SHOULDER]);

    // Track hip Y position history for jump/crouch detection
    this.hipYHistory.push(hipMid.y);
    if (this.hipYHistory.length > this.maxHistorySize) {
      this.hipYHistory.shift();
    }

    // Track acceleration history
    if (accelData) {
      this.accelHistory.push(accelData);
      if (this.accelHistory.length > this.maxHistorySize) {
        this.accelHistory.shift();
      }
    }

    // Calculate body metrics
    const kneeAngleL = this._angle(
      lm[LANDMARK.LEFT_HIP], lm[LANDMARK.LEFT_KNEE], lm[LANDMARK.LEFT_ANKLE]
    );
    const kneeAngleR = this._angle(
      lm[LANDMARK.RIGHT_HIP], lm[LANDMARK.RIGHT_KNEE], lm[LANDMARK.RIGHT_ANKLE]
    );
    const elbowAngleL = this._angle(
      lm[LANDMARK.LEFT_SHOULDER], lm[LANDMARK.LEFT_ELBOW], lm[LANDMARK.LEFT_WRIST]
    );
    const elbowAngleR = this._angle(
      lm[LANDMARK.RIGHT_SHOULDER], lm[LANDMARK.RIGHT_ELBOW], lm[LANDMARK.RIGHT_WRIST]
    );

    // Arms raised? (wrists above shoulders)
    const armsRaised =
      lm[LANDMARK.LEFT_WRIST].y < lm[LANDMARK.LEFT_SHOULDER].y &&
      lm[LANDMARK.RIGHT_WRIST].y < lm[LANDMARK.RIGHT_SHOULDER].y;

    // One arm raised?
    const oneArmRaised =
      lm[LANDMARK.LEFT_WRIST].y < lm[LANDMARK.LEFT_SHOULDER].y ||
      lm[LANDMARK.RIGHT_WRIST].y < lm[LANDMARK.RIGHT_SHOULDER].y;

    // Acceleration magnitude
    const accelMag = accelData
      ? Math.sqrt(accelData.x ** 2 + accelData.y ** 2 + accelData.z ** 2)
      : 9.8;

    // Hip vertical velocity (in normalized coords, lower y = higher up)
    const hipVelocityY =
      this.hipYHistory.length >= 2
        ? this.hipYHistory[this.hipYHistory.length - 1] -
          this.hipYHistory[this.hipYHistory.length - 2]
        : 0;

    // Cooldown for jump detection
    if (this.jumpCooldown > 0) this.jumpCooldown--;

    // --- JUMP DETECTION ---
    // Hip moves up rapidly (negative Y change in normalized coords) + high accel spike
    if (
      this.jumpCooldown === 0 &&
      hipVelocityY < -0.03 &&
      accelMag > 15
    ) {
      this.jumpCooldown = 15; // ~0.75s cooldown
      return { activity: 'jump', confidence: 0.85 };
    }

    // --- CROUCH / SQUAT DETECTION ---
    if (kneeAngleL < 120 && kneeAngleR < 120) {
      return { activity: 'crouch', confidence: 0.8 };
    }

    // --- ARMS RAISED (wave, surrender, stretch) ---
    if (armsRaised) {
      return { activity: 'arms_raised', confidence: 0.85 };
    }

    // --- WALKING DETECTION ---
    // Periodic acceleration pattern + alternating knee angles
    const accelVariance = this._calcAccelVariance();
    if (accelVariance > 2.0 && accelVariance < 20) {
      return { activity: 'walking', confidence: 0.7 };
    }

    // --- DANCING DETECTION ---
    // High variance in acceleration + arms moving + body moving
    if (accelVariance > 20 && oneArmRaised) {
      return { activity: 'dancing', confidence: 0.6 };
    }

    // --- RUNNING DETECTION ---
    if (accelVariance > 25) {
      return { activity: 'running', confidence: 0.65 };
    }

    // --- IDLE (default) ---
    return { activity: 'idle', confidence: 0.9 };
  }

  _calcAccelVariance() {
    if (this.accelHistory.length < 5) return 0;
    const recent = this.accelHistory.slice(-10);
    const magnitudes = recent.map((a) =>
      Math.sqrt(a.x ** 2 + a.y ** 2 + a.z ** 2)
    );
    const mean = magnitudes.reduce((s, v) => s + v, 0) / magnitudes.length;
    const variance =
      magnitudes.reduce((s, v) => s + (v - mean) ** 2, 0) / magnitudes.length;
    return variance;
  }

  reset() {
    this.prevHipY = null;
    this.accelHistory = [];
    this.hipYHistory = [];
    this.jumpCooldown = 0;
  }
}

export default new ActivityClassifier();