import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import MqttService from '../services/MqttService';

export default function SettingsScreen({ navigation }) {
  const [host, setHost] = useState(MqttService.config.host);
  const [port, setPort] = useState(String(MqttService.config.port));
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      MqttService.disconnect();
      await MqttService.connect(host, parseInt(port, 10));
      Alert.alert('Success', 'Connected to MQTT broker!', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      Alert.alert(
        'Connection Failed',
        `Could not connect to ${host}:${port}.\n\nMake sure:\n1. Mosquitto is running on your PC\n2. WebSocket listener is enabled on port ${port}\n3. Your phone and PC are on the same WiFi network\n4. The IP address is correct`
      );
    }
    setIsConnecting(false);
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>MQTT Broker Settings</Text>
      <Text style={styles.subtitle}>
        Connect to your PC running Mosquitto
      </Text>

      <Text style={styles.label}>Broker IP Address</Text>
      <TextInput
        style={styles.input}
        value={host}
        onChangeText={setHost}
        placeholder="e.g., 192.168.1.100"
        placeholderTextColor="#666"
        keyboardType="numeric"
      />
      <Text style={styles.hint}>
        Find your PC's IP: open a terminal and run "ipconfig" (Windows)
        or "ifconfig" (Mac/Linux)
      </Text>

      <Text style={styles.label}>WebSocket Port</Text>
      <TextInput
        style={styles.input}
        value={port}
        onChangeText={setPort}
        placeholder="9001"
        placeholderTextColor="#666"
        keyboardType="numeric"
      />
      <Text style={styles.hint}>
        Default Mosquitto WebSocket port is 9001
      </Text>

      <TouchableOpacity
        style={[styles.btn, isConnecting && styles.btnDisabled]}
        onPress={handleConnect}
        disabled={isConnecting}
      >
        <Text style={styles.btnText}>
          {isConnecting ? 'CONNECTING...' : 'CONNECT'}
        </Text>
      </TouchableOpacity>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>Mosquitto Setup</Text>
        <Text style={styles.infoText}>
          1. Install Mosquitto from mosquitto.org{'\n'}
          2. Edit mosquitto.conf and add:{'\n'}
          {'\n'}
          listener 1883{'\n'}
          allow_anonymous true{'\n'}
          listener 9001{'\n'}
          protocol websockets{'\n'}
          {'\n'}
          3. Start: mosquitto -c mosquitto.conf -v{'\n'}
          4. Enter your PC's IP address above
        </Text>
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>MQTT Topics Published</Text>
        <Text style={styles.infoText}>
          phone/pose — 33 body landmarks + bone rotations{'\n'}
          phone/sensors — Accelerometer data (legacy){'\n'}
          phone/activity — Detected activity (idle/walk/jump/etc.)
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111', padding: 20 },
  title: { color: '#fff', fontSize: 24, fontWeight: '700', marginTop: 20 },
  subtitle: { color: '#888', fontSize: 14, marginBottom: 24 },

  label: { color: '#ccc', fontSize: 14, fontWeight: '600', marginTop: 16 },
  input: {
    backgroundColor: '#222',
    color: '#fff',
    fontSize: 18,
    padding: 14,
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#444',
  },
  hint: { color: '#666', fontSize: 12, marginTop: 4 },

  btn: {
    backgroundColor: '#4CAF50',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 24,
  },
  btnDisabled: { backgroundColor: '#666' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  infoBox: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 16,
    marginTop: 24,
    borderWidth: 1,
    borderColor: '#333',
  },
  infoTitle: { color: '#6C63FF', fontSize: 14, fontWeight: '700', marginBottom: 8 },
  infoText: { color: '#aaa', fontSize: 13, lineHeight: 20, fontFamily: 'monospace' },
});