import {
  accelerometer,
  gyroscope,
  setUpdateIntervalForType,
  SensorTypes,
} from 'react-native-sensors';

class SensorService {
  constructor() {
    this.accelSubscription = null;
    this.gyroSubscription = null;
    this.latestAccel = { x: 0, y: 0, z: 0 };
    this.latestGyro = { x: 0, y: 0, z: 0 };
    this.onAccelUpdate = null;
    this.onGyroUpdate = null;
    this.isRunning = false;
  }

  start(intervalMs = 50) {
    if (this.isRunning) return;

    // Set sensor update interval (50ms = 20Hz, good balance of perf and data)
    setUpdateIntervalForType(SensorTypes.accelerometer, intervalMs);
    setUpdateIntervalForType(SensorTypes.gyroscope, intervalMs);

    // Subscribe to accelerometer
    this.accelSubscription = accelerometer.subscribe(({ x, y, z, timestamp }) => {
      this.latestAccel = { x, y, z, timestamp };
      this.onAccelUpdate?.({ x, y, z, timestamp });
    });

    // Subscribe to gyroscope
    this.gyroSubscription = gyroscope.subscribe(({ x, y, z, timestamp }) => {
      this.latestGyro = { x, y, z, timestamp };
      this.onGyroUpdate?.({ x, y, z, timestamp });
    });

    this.isRunning = true;
    console.log('[Sensors] Started with interval:', intervalMs, 'ms');
  }

  stop() {
    this.accelSubscription?.unsubscribe();
    this.gyroSubscription?.unsubscribe();
    this.accelSubscription = null;
    this.gyroSubscription = null;
    this.isRunning = false;
    console.log('[Sensors] Stopped');
  }

  getLatest() {
    return {
      accelerometer: this.latestAccel,
      gyroscope: this.latestGyro,
    };
  }
}

export default new SensorService();