const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');

const { TOPICS } = require('../config/mqtt');
const { publish, getMqttClient } = require('../mqtt/client');
const { getRedisClient } = require('../config/redis');
const { getMongoStatus } = require('../config/db');

const execAsync = promisify(exec);

const DEDUP_KEY = 'sysmon:last';
const CPU_CHANGE_THRESHOLD = 5;
const MEM_CHANGE_THRESHOLD = 5;
const TEMP_CHANGE_THRESHOLD = 2;

let previousCpuTimes = os.cpus();

function getCpuPercent() {
  const currentCpuTimes = os.cpus();
  let idleDiff = 0;
  let totalDiff = 0;

  currentCpuTimes.forEach((core, index) => {
    const prevTimes = previousCpuTimes[index].times;
    const currTimes = core.times;

    const prevTotal = Object.values(prevTimes).reduce((sum, value) => sum + value, 0);
    const currTotal = Object.values(currTimes).reduce((sum, value) => sum + value, 0);

    idleDiff += currTimes.idle - prevTimes.idle;
    totalDiff += currTotal - prevTotal;
  });

  previousCpuTimes = currentCpuTimes;

  if (totalDiff === 0) {
    return 0;
  }

  return Number((100 - (idleDiff / totalDiff) * 100).toFixed(1));
}

function getMemPercent() {
  const total = os.totalmem();
  const free = os.freemem();
  return Number((((total - free) / total) * 100).toFixed(1));
}

async function getDiskPercent() {
  try {
    const { stdout } = await execAsync("df -P / | tail -1 | awk '{print $5}'");
    return Number(stdout.replace('%', '').trim());
  } catch (err) {
    console.error('Impossibile leggere uso disco', err.message);
    return null;
  }
}

async function getTempC() {
  try {
    const { stdout } = await execAsync('cat /sys/class/thermal/thermal_zone0/temp');
    return Number((Number(stdout.trim()) / 1000).toFixed(1));
  } catch {
    return null;
  }
}

// Lo stato dei servizi è derivato dalle connessioni gia mantenute da questo stesso
// backend (mongodb, redis, mosquitto), non da systemctl/docker: il processo Node gira
// in un container e non ha accesso diretto a systemd o al docker socket dell'host.
function getServiceStatuses() {
  let redisStatus = 'error';
  try {
    redisStatus = getRedisClient().isReady ? 'ok' : 'error';
  } catch {
    redisStatus = 'error';
  }

  const mqttClient = getMqttClient();
  const mqttStatus = mqttClient && mqttClient.connected ? 'ok' : 'error';

  return [
    { name: 'mongodb', status: getMongoStatus() },
    { name: 'redis', status: redisStatus },
    { name: 'mosquitto', status: mqttStatus },
  ];
}

function hasSignificantChange(previous, next) {
  if (!previous) {
    return true;
  }

  if (Math.abs(previous.cpu_percent - next.cpu_percent) >= CPU_CHANGE_THRESHOLD) {
    return true;
  }

  if (Math.abs(previous.mem_percent - next.mem_percent) >= MEM_CHANGE_THRESHOLD) {
    return true;
  }

  if (previous.disk_percent !== next.disk_percent) {
    return true;
  }

  if (previous.temp_c !== null && next.temp_c !== null
    && Math.abs(previous.temp_c - next.temp_c) >= TEMP_CHANGE_THRESHOLD) {
    return true;
  }

  return JSON.stringify(previous.services) !== JSON.stringify(next.services);
}

async function publishSysmon(options = {}) {
  const { force = false } = options;

  const payload = {
    cpu_percent: getCpuPercent(),
    mem_percent: getMemPercent(),
    disk_percent: await getDiskPercent(),
    temp_c: await getTempC(),
    services: getServiceStatuses(),
  };

  const redis = getRedisClient();
  const cached = await redis.get(DEDUP_KEY);
  const previous = cached ? JSON.parse(cached) : null;

  if (!force && !hasSignificantChange(previous, payload)) {
    return;
  }

  await publish(TOPICS.dataSysmon, payload, { qos: 0 });

  await redis.set(DEDUP_KEY, JSON.stringify(payload));
}

module.exports = { publishSysmon };