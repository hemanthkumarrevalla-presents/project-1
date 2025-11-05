const DEFAULT_INTERSECTIONS = [
  {
    id: "junction-1",
    name: "MG Road & Residency Road",
    approaches: ["north", "south", "east", "west"],
    baselineCycleSeconds: 120
  },
  {
    id: "junction-2",
    name: "Indiranagar 100ft & CMH Road",
    approaches: ["north", "south", "east", "west"],
    baselineCycleSeconds: 110
  },
  {
    id: "junction-3",
    name: "Silk Board Junction",
    approaches: ["north", "south", "east", "west", "service"],
    baselineCycleSeconds: 150
  }
];

const DEFAULT_OVERRIDE_DURATION = 90; // seconds
const SENSOR_NOISE = 6;
const MAX_QUEUE = 40;
const MIN_QUEUE = 2;

const MODES = {
  normal: {
    queueMultiplier: 1,
    emergencyProbability: 0.06,
    drift: SENSOR_NOISE,
    waitFactor: 1
  },
  rush_hour: {
    queueMultiplier: 1.6,
    emergencyProbability: 0.08,
    drift: SENSOR_NOISE + 4,
    waitFactor: 1.25
  },
  emergency: {
    queueMultiplier: 1.2,
    emergencyProbability: 0.25,
    drift: SENSOR_NOISE + 2,
    waitFactor: 1.4
  }
};

const SMART_QUEUE_ATTENUATION = 0.82;
const SMART_WAIT_ATTENUATION = 0.78;

const randomBetween = (min, max) => Math.round(Math.random() * (max - min) + min);

function buildInitialState(config = DEFAULT_INTERSECTIONS) {
  const now = Date.now();
  return config.map((intersection) => ({
    ...intersection,
    lastUpdated: now,
    activeApproach: intersection.approaches[0],
    overrideUntil: null,
    readings: intersection.approaches.reduce((acc, approach) => {
      acc[approach] = {
        queueLength: randomBetween(5, 15),
        avgWaitSeconds: randomBetween(20, 45),
        emergencyVehicle: false
      };
      return acc;
    }, {})
  }));
}

function simulateSensorDrift(readings, options) {
  const {
    queueMultiplier = 1,
    emergencyProbability = 0.05,
    drift = SENSOR_NOISE,
    waitFactor = 1,
    smartMode = true
  } = options;

  return Object.entries(readings).reduce((acc, [approach, stats]) => {
    const delta = randomBetween(-drift, drift);
    let queueLength = stats.queueLength + delta;
    queueLength = Math.round(queueLength * queueMultiplier);
    if (smartMode) {
      queueLength = Math.round(queueLength * SMART_QUEUE_ATTENUATION);
    }
    queueLength = Math.min(MAX_QUEUE, Math.max(MIN_QUEUE, queueLength));

    const emergencyVehicle = Math.random() < emergencyProbability ? true : false;

    let avgWaitSeconds = Math.round(queueLength * 1.8 * waitFactor);
    if (smartMode) {
      avgWaitSeconds = Math.round(avgWaitSeconds * SMART_WAIT_ATTENUATION);
    }

    acc[approach] = {
      queueLength,
      avgWaitSeconds: Math.max(5, avgWaitSeconds),
      emergencyVehicle
    };
    return acc;
  }, {});
}

function pickPriorityLane(intersection) {
  if (intersection.overrideUntil && Date.now() < intersection.overrideUntil) {
    return intersection.activeApproach;
  }

  const entries = Object.entries(intersection.readings);
  entries.sort(([, a], [, b]) => {
    const emergencyBias = (x) => (x.emergencyVehicle ? MAX_QUEUE : 0);
    return b.queueLength + emergencyBias(b) - (a.queueLength + emergencyBias(a));
  });
  return entries[0][0];
}

function createHistoryBucket() {
  return [];
}

function recordSnapshot(history, intersections) {
  const snapshot = {
    timestamp: Date.now(),
    intersections: intersections.map(({ id, name, activeApproach, readings }) => ({
      id,
      name,
      activeApproach,
      readings
    }))
  };
  history.push(snapshot);
  if (history.length > 120) {
    history.shift();
  }
}

function computeCityMetrics(intersections) {
  const totals = intersections.reduce(
    (acc, intersection) => {
      Object.values(intersection.readings).forEach((reading) => {
        acc.queue += reading.queueLength;
        acc.wait += reading.avgWaitSeconds;
        acc.count += 1;
        if (reading.emergencyVehicle) acc.emergencies += 1;
      });
      return acc;
    },
    { queue: 0, wait: 0, count: 0, emergencies: 0 }
  );

  const junctionCongestion = intersections.map((intersection) => {
    const pressure = Object.values(intersection.readings).reduce(
      (sum, reading) => sum + reading.queueLength,
      0
    );
    return {
      id: intersection.id,
      name: intersection.name,
      congestionIndex: Number((pressure / (intersection.approaches.length * MAX_QUEUE)).toFixed(2))
    };
  });

  return {
    avgQueue: totals.count ? Number((totals.queue / totals.count).toFixed(1)) : 0,
    avgWaitSeconds: totals.count ? Number((totals.wait / totals.count).toFixed(1)) : 0,
    activeEmergencies: totals.emergencies,
    junctionCongestion
  };
}

function createSimulator(config = DEFAULT_INTERSECTIONS) {
  let intersections = buildInitialState(config);
  const history = createHistoryBucket();
  let currentMode = "normal";
  let smartMode = true;
  recordSnapshot(history, intersections);

  const modeSettings = () => MODES[currentMode] || MODES.normal;

  function step() {
    intersections = intersections.map((intersection) => {
      const readings = simulateSensorDrift(intersection.readings, {
        ...modeSettings(),
        smartMode
      });
      const activeApproach = pickPriorityLane({ ...intersection, readings });
      return {
        ...intersection,
        lastUpdated: Date.now(),
        readings,
        activeApproach
      };
    });
    recordSnapshot(history, intersections);
  }

  function getState() {
    return {
      updatedAt: Date.now(),
      intersections,
      metrics: computeCityMetrics(intersections),
      mode: currentMode,
      smartMode
    };
  }

  function overrideSignal({ id, approach, durationSeconds = DEFAULT_OVERRIDE_DURATION }) {
    const target = intersections.find((intersection) => intersection.id === id);
    if (!target) {
      throw new Error(`Intersection ${id} not found`);
    }

    if (!target.approaches.includes(approach)) {
      throw new Error(`Approach ${approach} not valid for ${target.name}`);
    }

    target.overrideUntil = Date.now() + durationSeconds * 1000;
    target.activeApproach = approach;
    return {
      id: target.id,
      overrideUntil: target.overrideUntil,
      activeApproach: approach
    };
  }

  function getHistory(limit = 20) {
    return history.slice(-limit);
  }

  function setMode(nextMode) {
    if (!MODES[nextMode]) {
      throw new Error(`Mode ${nextMode} is not supported`);
    }
    currentMode = nextMode;
    return { mode: currentMode };
  }

  function setSmartMode(enabled) {
    smartMode = Boolean(enabled);
    return { smartMode };
  }

  function getConfig() {
    return {
      mode: currentMode,
      smartMode,
      availableModes: Object.keys(MODES)
    };
  }

  return {
    step,
    getState,
    getHistory,
    overrideSignal,
    setMode,
    setSmartMode,
    getConfig
  };
}

module.exports = createSimulator;
