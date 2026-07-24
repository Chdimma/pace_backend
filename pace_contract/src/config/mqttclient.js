const mqtt = require('mqtt');
require('dotenv').config();

const brokerHost = process.env.HIVEMQ_BROKER_URL;
const brokerUser = process.env.HIVEMQ_USERNAME;
const brokerPass = process.env.HIVEMQ_PASSWORD;

if (!brokerHost || !brokerUser || !brokerPass) {
  throw new Error(
    'Missing HiveMQ configuration. Please set HIVEMQ_BROKER_URL, HIVEMQ_USERNAME, and HIVEMQ_PASSWORD in your .env file.'
  );
}

const rawHost = (process.env.HIVEMQ_BROKER_URL || '')
  .replace(/^mqtts?:\/\//, '')
  .replace(/^tls:\/\//, '') // Also strips tls:// if present
  .replace(/:8883$/, '');    // Strips port if present

const brokerUrl = `mqtts://${rawHost}:8883`;

const clientId = `pace-backend-${Math.random().toString(16).slice(2, 12)}`;

const options = {
  clientId,
  port: 8883,
  protocol: 'mqtts',
  username: brokerUser,
  password: brokerPass,
  clean: true,
  connectTimeout: 30000,
  reconnectPeriod: 5000,
  rejectUnauthorized: true
};

console.log('Connecting to HiveMQ:', brokerUrl);
console.log('HiveMQ clientId:', clientId);

const mqttClient = mqtt.connect(brokerUrl, options);

mqttClient.on('connect', () => {
  console.log('⚡ Connected seamlessly to HiveMQ Broker!');
});

mqttClient.on('reconnect', () => {
  console.log('MQTT reconnecting to HiveMQ...');
});

mqttClient.on('close', () => {
  console.log('MQTT connection closed');
});

mqttClient.on('error', (err) => {
  console.error('MQTT Connection Error:', err.message || err);
  if (err.code) console.error('MQTT Error Code:', err.code);
  if (err.code === 5) {
    console.error('Authorization failed: verify your HiveMQ username/password and broker ACL settings.');
    mqttClient.end(true);
  }
});

module.exports = mqttClient;