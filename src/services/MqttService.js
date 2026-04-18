// Simple MQTT-like publisher using raw WebSocket
// No paho dependency — just sends JSON over WebSocket to Mosquitto

class MqttService {
  constructor() {
    this.ws = null;
    this.isConnected = false;
    this.onConnectionChange = null;
    this.config = {
      host: '172.20.10.14',
      port: 9001,
    };
  }

  connect(host, port) {
    if (host) this.config.host = host;
    if (port) this.config.port = port;

    this.disconnect();

    return new Promise((resolve, reject) => {
      try {
        const url = `ws://${this.config.host}:${this.config.port}/mqtt`;
        this.ws = new WebSocket(url, ['mqtt']);
        this.ws.binaryType = 'arraybuffer';

        const timeout = setTimeout(() => {
          if (!this.isConnected) {
            this.disconnect();
            reject(new Error('Connection timeout'));
          }
        }, 10000);

        this.ws.onopen = () => {
          // Send MQTT CONNECT packet
          const connectPacket = this._buildConnectPacket();
          this.ws.send(connectPacket);
        };

        this.ws.onmessage = event => {
          const data = new Uint8Array(event.data);
          // CONNACK is type 0x20
          if (data[0] === 0x20 && !this.isConnected) {
            clearTimeout(timeout);
            this.isConnected = true;
            this.onConnectionChange?.(true);
            // Start keepalive ping every 30s
            this._startPing();
            resolve();
          }
          // PINGRESP is type 0xD0
          if (data[0] === 0xd0) {
            this._pingPending = false;
          }
        };

        this.ws.onclose = e => {
          console.log('MQTT WS CLOSED:', e.code, e.reason);
          clearTimeout(timeout);
          const wasConnected = this.isConnected;
          this.isConnected = false;
          this._stopPing();
          if (wasConnected) {
            this.onConnectionChange?.(false);
          }
        };

        this.ws.onerror = e => {
          console.log('MQTT WS ERROR:', e.message || JSON.stringify(e));
          clearTimeout(timeout);
          this.isConnected = false;
          this._stopPing();
          this.onConnectionChange?.(false);
          reject(new Error('WebSocket error: ' + (e.message || 'unknown')));
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  _buildConnectPacket() {
    const clientId = `PT_${Date.now().toString(36)}`;
    const clientIdBytes = this._encodeUTF8(clientId);

    // Variable header: protocol name + level + flags + keepalive
    const protocolName = [0x00, 0x04, 0x4d, 0x51, 0x54, 0x54]; // "MQTT"
    const protocolLevel = 0x04; // MQTT 3.1.1
    const connectFlags = 0x02; // Clean session
    const keepAlive = [0x00, 0x3c]; // 60 seconds

    const variableHeader = [
      ...protocolName,
      protocolLevel,
      connectFlags,
      ...keepAlive,
    ];
    const payload = [...this._encodeString(clientId)];
    const remainingLength = variableHeader.length + payload.length;

    const packet = new Uint8Array(
      1 + this._encodeMBI(remainingLength).length + remainingLength,
    );
    let pos = 0;
    packet[pos++] = 0x10; // CONNECT packet type
    const mbi = this._encodeMBI(remainingLength);
    for (let i = 0; i < mbi.length; i++) packet[pos++] = mbi[i];
    for (let i = 0; i < variableHeader.length; i++)
      packet[pos++] = variableHeader[i];
    for (let i = 0; i < payload.length; i++) packet[pos++] = payload[i];

    return packet.buffer;
  }

  _buildPublishPacket(topic, message) {
    const topicBytes = this._encodeString(topic);
    const messageBytes = this._encodeUTF8(message);
    const remainingLength = topicBytes.length + messageBytes.length;

    const packet = new Uint8Array(
      1 + this._encodeMBI(remainingLength).length + remainingLength,
    );
    let pos = 0;
    packet[pos++] = 0x30; // PUBLISH packet type, QoS 0
    const mbi = this._encodeMBI(remainingLength);
    for (let i = 0; i < mbi.length; i++) packet[pos++] = mbi[i];
    for (let i = 0; i < topicBytes.length; i++) packet[pos++] = topicBytes[i];
    for (let i = 0; i < messageBytes.length; i++)
      packet[pos++] = messageBytes[i];

    return packet.buffer;
  }

  _buildPingPacket() {
    return new Uint8Array([0xc0, 0x00]).buffer;
  }

  _encodeString(str) {
    const bytes = this._encodeUTF8(str);
    return [bytes.length >> 8, bytes.length & 0xff, ...bytes];
  }

  _encodeUTF8(str) {
    const bytes = [];
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      if (c < 0x80) bytes.push(c);
      else if (c < 0x800) {
        bytes.push(0xc0 | (c >> 6));
        bytes.push(0x80 | (c & 0x3f));
      } else {
        bytes.push(0xe0 | (c >> 12));
        bytes.push(0x80 | ((c >> 6) & 0x3f));
        bytes.push(0x80 | (c & 0x3f));
      }
    }
    return bytes;
  }

  _encodeMBI(num) {
    const output = [];
    do {
      let digit = num % 128;
      num = Math.floor(num / 128);
      if (num > 0) digit |= 0x80;
      output.push(digit);
    } while (num > 0);
    return output;
  }

  _startPing() {
    this._stopPing();
    this._pingPending = false;
    this._pingInterval = setInterval(() => {
      if (!this.isConnected || !this.ws) return;
      if (this._pingPending) {
        // No response to last ping — connection dead
        this.disconnect();
        return;
      }
      try {
        this.ws.send(this._buildPingPacket());
        this._pingPending = true;
      } catch (e) {
        this.disconnect();
      }
    }, 30000);
  }

  _stopPing() {
    if (this._pingInterval) {
      clearInterval(this._pingInterval);
      this._pingInterval = null;
    }
  }

  _safeSend(topic, payload) {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN)
      return;
    try {
      this.ws.send(this._buildPublishPacket(topic, payload));
    } catch (e) {
      // Silently fail
    }
  }

  publishPose(landmarks) {
    this._safeSend(
      'phone/pose',
      JSON.stringify({
        type: 'pose_landmarks',
        timestamp: Date.now(),
        landmarks: landmarks,
      }),
    );
  }

  publishSensors(sensorData) {
    this._safeSend('phone/sensors', JSON.stringify(sensorData));
  }

  publishActivity(activity, confidence) {
    this._safeSend(
      'phone/activity',
      JSON.stringify({
        type: 'activity',
        activity: activity,
        confidence: confidence,
        timestamp: Date.now(),
      }),
    );
  }

  disconnect() {
    this._stopPing();
    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN) {
          // Send DISCONNECT packet
          this.ws.send(new Uint8Array([0xe0, 0x00]).buffer);
        }
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }
    this.isConnected = false;
    this.onConnectionChange?.(false);
  }
}

export default new MqttService();
