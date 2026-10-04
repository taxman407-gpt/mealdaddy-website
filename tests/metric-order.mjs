import assert from "node:assert/strict";
import { defaultMetricOrder, moveMetric, moveMetricToPosition, normalizeMetricOrder } from "../app/metric-order.js";

const defaultOrder = normalizeMetricOrder([]);
assert.equal(defaultOrder.length, 8);
assert.equal(new Set(defaultOrder).size, 8);

const inflammationOrder = defaultMetricOrder({ primary_goals: ["Reduce Inflammation"] });
assert.equal(inflammationOrder[0], "inflammation");

const lowCarbOrder = defaultMetricOrder({ primary_eating_style: "Low Carb" });
assert.equal(lowCarbOrder[0], "netCarbs");

const custom = normalizeMetricOrder(["water", "protein"]);
assert.deepEqual(custom.slice(0, 2), ["water", "protein"]);
assert.equal(custom.length, 8);

assert.deepEqual(moveMetric(defaultOrder, "protein", -1).slice(0, 2), ["protein", "calories"]);
assert.deepEqual(moveMetric(defaultOrder, "calories", -1), defaultOrder);
assert.deepEqual(moveMetricToPosition(defaultOrder, "water", 1).slice(0, 2), ["water", "calories"]);
assert.deepEqual(moveMetricToPosition(defaultOrder, "calories", 8).slice(-1), ["calories"]);

console.log("Today metric-order checks passed.");
