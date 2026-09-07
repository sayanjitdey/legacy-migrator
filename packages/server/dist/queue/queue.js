"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrationQueue = exports.MIGRATION_QUEUE_NAME = exports.connection = void 0;
const bullmq_1 = require("bullmq");
// A bare host/port object, not a live connection — BullMQ opens its own
// ioredis connections from this config wherever it's passed (Queue,
// Worker, QueueEvents). Sharing the config object (not a connection
// instance) is the documented BullMQ pattern.
exports.connection = { host: "127.0.0.1", port: 6379 };
exports.MIGRATION_QUEUE_NAME = "migrations";
exports.migrationQueue = new bullmq_1.Queue(exports.MIGRATION_QUEUE_NAME, { connection: exports.connection });
