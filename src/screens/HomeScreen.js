import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { RNMediapipe, switchCamera } from '@thinksys/react-native-mediapipe';
import MqttService from '../services/MqttService';
import SensorService from '../services/SensorService';
import ActivityClassifier from '../services/ActivityClassifier';

const { width: SW, height: SH } = Dimensions.get('window');

export default function HomeScreen({ navigation }) {
  const [isTracking, setIsTracking] = useState(false);
  const [mqttConnected, setMqttConnected] = useState(false);
  const [currentActivity, setCurrentActivity] = useState('idle');
  const [fps, setFps] = useState(0);
  const [landmarkCount, setLandmarkCount] = useState(0);
  const [debugInfo, setDebugInfo] = useState('Waiting...');

  const frameCount = useRef(0);
  const lastFpsTime = useRef(Date.now());
  const publishInterval = useRef(null);
  const latestLandmarks = useRef(null);
  const latestWorldLandmarks = useRef(null);
  const latestSensorData = useRef(null);
  const currentActivityRef = useRef('idle');

  useEffect(() => {
    MqttService.onConnectionChange = connected => setMqttConnected(connected);
    return () => {
      MqttService.disconnect();
      SensorService.stop();
    };
  }, []);

  const onLandmark = useCallback(rawData => {
    // ── DEBUG: log full payload structure once ──
    // Wait for MediaPipe to actually detect a body before logging
    const hasData = (() => {
      try {
        const probe =
          typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
        const probedData = probe.nativeEvent || probe;
        return (
          probedData.landmarks &&
          Array.isArray(probedData.landmarks) &&
          probedData.landmarks.length > 0
        );
      } catch {
        return false;
      }
    })();

    if (!global.__loggedPayload && hasData) {
      global.__loggedPayload = true;
      try {
        const sample =
          typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
        const data = sample.nativeEvent || sample;
        console.log('=== ThinkSys onLandmark payload keys ===');
        console.log('Top-level keys:', Object.keys(data));
        console.log(
          'Full sample (first 2000 chars):',
          JSON.stringify(data).slice(0, 2000),
        );

        // NEW: Inspect worldLandmarks specifically
        if (data.worldLandmarks) {
          console.log('=== worldLandmarks structure ===');
          console.log('Type:', typeof data.worldLandmarks);
          console.log('Is array:', Array.isArray(data.worldLandmarks));
          console.log('Length:', data.worldLandmarks?.length);
          console.log(
            'First 3 worldLandmarks:',
            JSON.stringify(data.worldLandmarks?.slice(0, 3)),
          );
          console.log(
            'Landmark #15 (wrist):',
            JSON.stringify(data.worldLandmarks?.[15]),
          );
        } else {
          console.log('worldLandmarks NOT FOUND');
        }
      } catch (e) {
        console.log('Logging error:', e.message);
      }
    }
    // ── end debug ──

    if (!rawData) return;
    try {
      let landmarks = null;
      let worldLandmarks = null;

      const data = (() => {
        if (typeof rawData === 'string') return JSON.parse(rawData);
        return rawData.nativeEvent || rawData;
      })();

      // Image-space landmarks (33 × {x,y,z,visibility})
      if (
        data.landmarks &&
        Array.isArray(data.landmarks) &&
        data.landmarks.length > 0
      ) {
        landmarks = data.landmarks.map(lm => ({
          x: lm.x ?? 0,
          y: lm.y ?? 0,
          z: lm.z ?? 0,
          visibility: lm.visibility ?? 1,
        }));
      }

      // NEW: World-space landmarks (33 × {x,y,z} in meters, hip-centered)
      if (
        data.worldLandmarks &&
        Array.isArray(data.worldLandmarks) &&
        data.worldLandmarks.length > 0
      ) {
        worldLandmarks = data.worldLandmarks.map(lm => ({
          x: lm.x ?? 0,
          y: lm.y ?? 0,
          z: lm.z ?? 0,
          visibility: lm.visibility ?? 1,
        }));
      }

      if (landmarks) {
        latestLandmarks.current = landmarks;
        latestWorldLandmarks.current = worldLandmarks; // NEW
        setLandmarkCount(landmarks.length);
        setDebugInfo(
          `✅ ${landmarks.length} pts${worldLandmarks ? ' + 3D world' : ''}`,
        );
      }
    } catch (e) {
      setDebugInfo('Parse error: ' + e.message);
    }

    frameCount.current++;
    const now = Date.now();
    if (now - lastFpsTime.current >= 1000) {
      setFps(frameCount.current);
      frameCount.current = 0;
      lastFpsTime.current = now;
    }
  }, []);

  const toggleTracking = useCallback(() => {
    if (isTracking) {
      SensorService.stop();
      if (publishInterval.current) {
        clearInterval(publishInterval.current);
        publishInterval.current = null;
      }
      ActivityClassifier.reset();
      setIsTracking(false);
      setDebugInfo('Stopped');
    } else {
      SensorService.start(50);
      SensorService.onAccelUpdate = accel => {
        latestSensorData.current = accel;
      };

      publishInterval.current = setInterval(() => {
        if (!MqttService.isConnected) return;
        const landmarks = latestLandmarks.current;
        const sensorData = latestSensorData.current;

        if (landmarks && landmarks.length >= 33) {
          MqttService.publishPose(landmarks, latestWorldLandmarks.current);

          const result = ActivityClassifier.classify(landmarks, sensorData);
          if (result.activity !== currentActivityRef.current) {
            currentActivityRef.current = result.activity;
            setCurrentActivity(result.activity);
            MqttService.publishActivity(result.activity, result.confidence);
          }
        }

        if (sensorData) {
          MqttService.publishSensors({
            type: 'accelerometer',
            values: [sensorData.x, sensorData.y, sensorData.z],
            timestamp: Date.now(),
          });
        }
      }, 50);

      setIsTracking(true);
      setDebugInfo('Camera tracking...');
    }
  }, [isTracking]);

  return (
    <View style={s.container}>
      {/* Camera */}
      <View style={s.cameraContainer}>
        <RNMediapipe
          width={SW}
          height={SH * 0.55}
          face={false}
          leftArm
          rightArm
          leftWrist
          rightWrist
          torso
          leftLeg
          rightLeg
          leftAnkle
          rightAnkle
          onLandmark={onLandmark}
        />
      </View>

      {/* Status */}
      <View style={s.statusBar}>
        <View style={[s.dot, mqttConnected ? s.dotGreen : s.dotRed]} />
        <Text style={s.statusText}>
          {mqttConnected ? 'MQTT Connected' : 'MQTT Disconnected'}
        </Text>
        <Text style={s.fpsText}>{fps} FPS</Text>
        <Text style={s.landmarkText}>{landmarkCount} pts</Text>
      </View>

      {/* Debug */}
      <View style={s.debugBar}>
        <Text style={s.debugText} numberOfLines={2}>
          {debugInfo}
        </Text>
      </View>

      {/* Activity */}
      <View style={s.activityBar}>
        <Text style={s.activityLabel}>Activity:</Text>
        <View
          style={[
            s.activityBadge,
            { backgroundColor: activityColor(currentActivity) },
          ]}
        >
          <Text style={s.activityText}>
            {currentActivity.toUpperCase().replace('_', ' ')}
          </Text>
        </View>
      </View>

      {/* Controls */}
      <View style={s.controls}>
        <TouchableOpacity
          style={[s.btn, isTracking ? s.btnStop : s.btnStart]}
          onPress={toggleTracking}
        >
          <Text style={s.btnText}>{isTracking ? 'STOP' : 'START'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.btnSecondary} onPress={() => switchCamera()}>
          <Text style={s.btnSecondaryText}>FLIP</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.btnSecondary}
          onPress={() => navigation.navigate('Settings')}
        >
          <Text style={s.btnSecondaryText}>SETTINGS</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function activityColor(a) {
  return (
    {
      idle: '#555',
      walking: '#4CAF50',
      running: '#FF9800',
      jump: '#F44336',
      crouch: '#9C27B0',
      arms_raised: '#2196F3',
      dancing: '#E91E63',
    }[a] || '#6C63FF'
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  cameraContainer: { flex: 1 },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: 'rgba(0,0,0,0.7)',
    position: 'absolute',
    top: 44,
    left: 0,
    right: 0,
  },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  dotGreen: { backgroundColor: '#4CAF50' },
  dotRed: { backgroundColor: '#F44336' },
  statusText: { color: '#fff', fontSize: 12, flex: 1 },
  fpsText: { color: '#FFD700', fontSize: 12, marginRight: 12 },
  landmarkText: { color: '#87CEEB', fontSize: 12 },
  debugBar: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  debugText: { color: '#0f0', fontSize: 11, fontFamily: 'monospace' },
  activityBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  activityLabel: { color: '#aaa', fontSize: 14, marginRight: 8 },
  activityBadge: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderRadius: 12,
  },
  activityText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: '#111',
    paddingBottom: 30,
  },
  btn: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 8,
    minWidth: 120,
    alignItems: 'center',
  },
  btnStart: { backgroundColor: '#4CAF50' },
  btnStop: { backgroundColor: '#F44336' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnSecondary: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: '#333',
    alignItems: 'center',
  },
  btnSecondaryText: { color: '#ccc', fontSize: 14, fontWeight: '600' },
});
